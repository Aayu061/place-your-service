import { getSupabaseClient } from '../lib/supabase.js';
import { StaffMember, UserRole } from '../types/index.js';
import { ConflictError, NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

export interface CreateStaffPayload {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export interface UpdateStaffPayload {
  fullName?: string;
  phone?: string;
}

interface RawStaffJoin {
  id: string;
  profile_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
  } | null;
}

function mapStaffRecord(record: RawStaffJoin): StaffMember {
  return {
    id: record.id,
    profileId: record.profile_id,
    role: record.role as UserRole,
    isActive: record.is_active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    fullName: record.profiles?.full_name || 'Unknown',
    email: record.profiles?.email || 'unknown@pys.internal',
    phone: record.profiles?.phone || null,
    avatarUrl: record.profiles?.avatar_url || null,
  };
}

export class StaffService {
  /**
   * Retrieves all staff accounts with their associated user profile details.
   */
  public async listStaff(): Promise<{ staff: StaffMember[]; total: number }> {
    const supabase = getSupabaseClient();

    const { data, error, count } = await supabase
      .from('staff')
      .select('id, profile_id, role, is_active, created_at, updated_at, profiles(id, full_name, email, phone, avatar_url)', {
        count: 'exact',
      })
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to list staff records', { error: error.message });
      throw new BadRequestError('Failed to retrieve staff directory');
    }

    const staffMembers = (data as unknown as RawStaffJoin[]).map(mapStaffRecord);

    return {
      staff: staffMembers,
      total: count || staffMembers.length,
    };
  }

  /**
   * Retrieves a single staff member by ID.
   */
  public async getStaffById(staffId: string): Promise<StaffMember> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('staff')
      .select('id, profile_id, role, is_active, created_at, updated_at, profiles(id, full_name, email, phone, avatar_url)')
      .eq('id', staffId)
      .single();

    if (error || !data) {
      throw new NotFoundError('Staff member not found');
    }

    return mapStaffRecord(data as unknown as RawStaffJoin);
  }

  /**
   * Creates a new operational staff account.
   * Only assigns role 'STAFF' to preserve the Admin singleton invariant.
   */
  public async createStaff(
    payload: CreateStaffPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<StaffMember> {
    const supabase = getSupabaseClient();

    // Check if email already exists in profiles
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', payload.email)
      .limit(1);

    if (existingUser && existingUser.length > 0) {
      throw new ConflictError('A user account with this email address already exists.');
    }

    // Provision user in Supabase Auth via admin client
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName },
    });

    if (authError || !authData.user) {
      logger.error('Failed to create auth user in Supabase for staff', { error: authError?.message });
      throw new BadRequestError(authError?.message || 'Failed to create user in authentication provider');
    }

    const newUserId = authData.user.id;

    // Create profiles record
    const { error: profileError } = await supabase.from('profiles').insert({
      id: newUserId,
      full_name: payload.fullName,
      email: payload.email,
      phone: payload.phone || null,
    });

    if (profileError) {
      logger.error('Failed to create profiles record for staff', { error: profileError.message });
      await supabase.auth.admin.deleteUser(newUserId);
      throw new BadRequestError(`Failed to save staff profile: ${profileError.message}`);
    }

    // Create staff record (STRICTLY with role 'STAFF')
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .insert({
        profile_id: newUserId,
        role: 'STAFF',
        is_active: true,
      })
      .select('id, profile_id, role, is_active, created_at, updated_at')
      .single();

    if (staffError || !staffData) {
      logger.error('Failed to create staff record', { error: staffError?.message });
      await supabase.from('profiles').delete().eq('id', newUserId);
      await supabase.auth.admin.deleteUser(newUserId);
      throw new BadRequestError(`Failed to assign staff record: ${staffError?.message}`);
    }

    // Audit log
    await logActivity({
      actorProfileId,
      action: 'STAFF_CREATED',
      entityType: 'staff',
      entityId: staffData.id,
      details: { email: payload.email, fullName: payload.fullName, role: 'STAFF' },
      ipAddress,
    });

    logger.info('Staff account created successfully', { staffId: staffData.id, email: payload.email });

    return {
      id: staffData.id,
      profileId: newUserId,
      role: 'STAFF',
      isActive: true,
      createdAt: staffData.created_at,
      updatedAt: staffData.updated_at,
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone || null,
      avatarUrl: null,
    };
  }

  /**
   * Updates profile details (name, phone) for a staff member.
   */
  public async updateStaff(
    staffId: string,
    payload: UpdateStaffPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<StaffMember> {
    const supabase = getSupabaseClient();

    const existingStaff = await this.getStaffById(staffId);

    const updateFields: Record<string, unknown> = {};
    if (payload.fullName !== undefined) updateFields.full_name = payload.fullName;
    if (payload.phone !== undefined) updateFields.phone = payload.phone;

    const { error: profileError } = await supabase
      .from('profiles')
      .update(updateFields)
      .eq('id', existingStaff.profileId);

    if (profileError) {
      logger.error('Failed to update staff profile', { error: profileError.message });
      throw new BadRequestError(`Failed to update profile: ${profileError.message}`);
    }

    await logActivity({
      actorProfileId,
      action: 'STAFF_UPDATED',
      entityType: 'staff',
      entityId: staffId,
      details: updateFields,
      ipAddress,
    });

    return this.getStaffById(staffId);
  }

  /**
   * Toggles active/inactive status for a staff account.
   * Disallows deactivating the singleton Admin account.
   */
  public async updateStaffStatus(
    staffId: string,
    isActive: boolean,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<StaffMember> {
    const supabase = getSupabaseClient();

    const existingStaff = await this.getStaffById(staffId);

    // Guard: singleton Admin account cannot be deactivated
    if (existingStaff.role === 'ADMIN') {
      throw new ForbiddenError('Cannot modify the active status of the singleton Admin account.');
    }

    const { error: staffError } = await supabase
      .from('staff')
      .update({ is_active: isActive })
      .eq('id', staffId);

    if (staffError) {
      logger.error('Failed to update staff active status', { error: staffError.message });
      throw new BadRequestError(`Failed to update staff status: ${staffError.message}`);
    }

    const action = isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED';
    await logActivity({
      actorProfileId,
      action,
      entityType: 'staff',
      entityId: staffId,
      details: { isActive },
      ipAddress,
    });

    logger.info(`Staff account ${action.toLowerCase()}`, { staffId, isActive });

    return this.getStaffById(staffId);
  }
}

export const staffService = new StaffService();
