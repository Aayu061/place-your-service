import { getSupabaseClient } from '../lib/supabase.js';
import { UserProfileResponse, UserRole } from '../types/index.js';
import { ConflictError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

export interface BootstrapAdminPayload {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export class AuthService {
  /**
   * Retrieves profile and operational role details for an authenticated user.
   */
  public async getCurrentUser(profileId: string): Promise<UserProfileResponse> {
    const supabase = getSupabaseClient();

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url')
      .eq('id', profileId)
      .single();

    if (profileErr || !profile) {
      throw new NotFoundError('User profile not found');
    }

    const { data: staff, error: staffErr } = await supabase
      .from('staff')
      .select('id, role, is_active')
      .eq('profile_id', profileId)
      .single();

    if (staffErr || !staff) {
      throw new NotFoundError('Staff authorization record not found');
    }

    return {
      userId: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: staff.role as UserRole,
      profileId: profile.id,
      staffId: staff.id,
      isActive: staff.is_active,
      phone: profile.phone,
      avatarUrl: profile.avatar_url,
    };
  }

  /**
   * Secure bootstrap mechanism for the initial singleton Admin account.
   * If an Admin already exists in the system, rejects immediately with 409 Conflict.
   */
  public async bootstrapAdmin(
    payload: BootstrapAdminPayload,
    ipAddress?: string
  ): Promise<{ message: string; user: { id: string; email: string; fullName: string; role: UserRole } }> {
    const supabase = getSupabaseClient();

    // Verify if an Admin already exists (enforcing singleton invariant)
    const { data: existingAdmin, error: checkError } = await supabase
      .from('staff')
      .select('id')
      .eq('role', 'ADMIN')
      .limit(1);

    if (checkError) {
      logger.error('Failed checking existing admin count', { error: checkError.message });
      throw new BadRequestError('Could not verify existing administration state');
    }

    if (existingAdmin && existingAdmin.length > 0) {
      logger.warn('Attempted to bootstrap admin when Admin singleton already exists');
      throw new ConflictError('Admin account already exists. Only one Admin is permitted in PYS.');
    }

    // Provision user in Supabase Auth via admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName },
    });

    if (authError || !authData.user) {
      logger.error('Failed to provision auth user in Supabase', { error: authError?.message });
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
      logger.error('Failed to insert profiles record during bootstrap', { error: profileError.message });
      // Rollback auth user
      await supabase.auth.admin.deleteUser(newUserId);
      throw new BadRequestError(`Failed to save admin profile: ${profileError.message}`);
    }

    // Create staff record with role 'ADMIN'
    const { error: staffError } = await supabase.from('staff').insert({
      profile_id: newUserId,
      role: 'ADMIN',
      is_active: true,
    });

    if (staffError) {
      logger.error('Failed to insert staff record during bootstrap', { error: staffError.message });
      await supabase.from('profiles').delete().eq('id', newUserId);
      await supabase.auth.admin.deleteUser(newUserId);
      throw new BadRequestError(`Failed to assign admin role: ${staffError.message}`);
    }

    // Log security audit record
    await logActivity({
      actorProfileId: newUserId,
      action: 'ADMIN_BOOTSTRAP',
      entityType: 'staff',
      entityId: newUserId,
      details: { email: payload.email, fullName: payload.fullName },
      ipAddress,
    });

    logger.info('Singleton Admin account provisioned successfully', { email: payload.email, userId: newUserId });

    return {
      message: 'Admin account provisioned successfully',
      user: {
        id: newUserId,
        email: payload.email,
        fullName: payload.fullName,
        role: 'ADMIN',
      },
    };
  }
}

export const authService = new AuthService();
