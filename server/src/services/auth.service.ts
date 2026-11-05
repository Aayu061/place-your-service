import { getSupabaseClient, createAuthClient } from '../lib/supabase.js';
import { UserProfileResponse, UserRole } from '../types/index.js';
import { NotFoundError, BadRequestError, UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

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
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
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
