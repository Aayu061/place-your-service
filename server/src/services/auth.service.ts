import { getSupabaseClient } from '../lib/supabase.js';
import { UserProfileResponse, UserRole } from '../types/index.js';
import { ConflictError, NotFoundError, BadRequestError, UnauthorizedError, ForbiddenError } from '../utils/errors.js';
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
    let newUserId: string;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName },
    });

    if (authError || !authData?.user) {
      // Check if user already exists in auth.users
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existingUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === payload.email.toLowerCase()
      );

      if (existingUser) {
        newUserId = existingUser.id;
        // Update password and metadata for existing user
        const { error: updateErr } = await supabase.auth.admin.updateUserById(existingUser.id, {
          password: payload.password,
          email_confirm: true,
          user_metadata: { full_name: payload.fullName },
        });

        if (updateErr) {
          logger.error('Failed to update credentials on existing auth user', { error: updateErr.message });
          throw new BadRequestError(`Failed to update existing user: ${updateErr.message}`);
        }
      } else {
        logger.error('Failed to provision auth user in Supabase', { error: authError?.message });
        throw new BadRequestError(authError?.message || 'Failed to create user in authentication provider');
      }
    } else {
      newUserId = authData.user.id;
    }

    // Upsert profiles record
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', newUserId)
      .maybeSingle();

    if (!existingProfile) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: newUserId,
        full_name: payload.fullName,
        email: payload.email,
        phone: payload.phone || null,
      });

      if (profileError) {
        logger.error('Failed to insert profiles record during bootstrap', { error: profileError.message });
        throw new BadRequestError(`Failed to save admin profile: ${profileError.message}`);
      }
    } else {
      await supabase
        .from('profiles')
        .update({
          full_name: payload.fullName,
          email: payload.email,
          phone: payload.phone || null,
        })
        .eq('id', newUserId);
    }

    // Upsert staff record with role 'ADMIN'
    const { data: existingStaff } = await supabase
      .from('staff')
      .select('id, role')
      .eq('profile_id', newUserId)
      .maybeSingle();

    if (!existingStaff) {
      const { error: staffError } = await supabase.from('staff').insert({
        profile_id: newUserId,
        role: 'ADMIN',
        is_active: true,
      });

      if (staffError) {
        logger.error('Failed to insert staff record during bootstrap', { error: staffError.message });
        throw new BadRequestError(`Failed to assign admin role: ${staffError.message}`);
      }
    } else {
      await supabase
        .from('staff')
        .update({
          role: 'ADMIN',
          is_active: true,
        })
        .eq('id', existingStaff.id);
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

  /**
   * Authenticates user via Supabase Auth and returns JWT token & user profile details.
   */
  public async login(
    payload: { email: string; password: string },
    ipAddress?: string
  ): Promise<{
    token: string;
    session: {
      access_token: string;
      refresh_token: string;
      expires_at?: number;
    };
    user: UserProfileResponse;
  }> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });

    if (error || !data.session || !data.user) {
      logger.warn('Failed login attempt', { email: payload.email, error: error?.message });
      throw new UnauthorizedError('Invalid email or password. Please check your credentials.');
    }

    const userProfile = await this.getCurrentUser(data.user.id);

    if (!userProfile.isActive) {
      logger.warn('Inactive user attempted login', { userId: data.user.id });
      throw new ForbiddenError('Account is inactive. Please contact the system administrator.');
    }

    await logActivity({
      actorProfileId: userProfile.profileId,
      action: 'USER_LOGIN',
      entityType: 'session',
      entityId: data.user.id,
      details: { email: payload.email, role: userProfile.role },
      ipAddress,
    });

    return {
      token: data.session.access_token,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: userProfile,
    };
  }
}

export const authService = new AuthService();
