import React, { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/services/supabase';
import { apiClient, ApiError } from '@/services/api/client';
import { UserProfile, UserRole } from '@/domain/types';
import { AuthContext } from './authContextDef';

interface MeApiResponse {
  user: {
    userId: string;
    email: string;
    fullName: string;
    role: UserRole;
    profileId: string;
    staffId?: string;
    isActive: boolean;
    phone?: string | null;
    avatarUrl?: string | null;
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Resolves server-verified user profile & role via the Express backend.
   * Never trusts client-side local tokens or roles for authorization.
   */
  const fetchUserProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const response = await apiClient.get<MeApiResponse>('/auth/me');
      if (response && response.user) {
        if (!response.user.isActive) {
          throw new Error('Account is inactive. Please contact the system administrator.');
        }

        return {
          id: response.user.userId,
          email: response.user.email,
          fullName: response.user.fullName,
          role: response.user.role,
          isActive: response.user.isActive,
          phone: response.user.phone,
          avatarUrl: response.user.avatarUrl,
        };
      }
      return null;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 403) {
          throw new Error('Account is inactive. Please contact the system administrator.');
        }
        if (err.statusCode === 401) {
          return null;
        }
      }
      throw err;
    }
  }, []);

  /**
   * Initial session restoration:
   * Validates existing stored Supabase session, syncs token with ApiClient,
   * resolves server-side role, and clears the loading state to avoid UI flicker.
   */
  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    const initializeAuth = async () => {
      if (!supabase) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const { data, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (data.session && data.session.access_token) {
          apiClient.setAuthToken(data.session.access_token);
          if (isMounted) setSession(data.session);

          try {
            const profile = await fetchUserProfile();
            if (isMounted) setUser(profile);
          } catch (profileErr) {
            // If inactive or unauthorized, cleanly sign out
            await supabase.auth.signOut();
            apiClient.setAuthToken(null);
            if (isMounted) {
              setSession(null);
              setUser(null);
              setError(profileErr instanceof Error ? profileErr.message : 'Session verification failed');
            }
          }
        } else {
          apiClient.setAuthToken(null);
          if (isMounted) {
            setSession(null);
            setUser(null);
          }
        }
      } catch (err) {
        console.warn('[AuthContext] Session restoration error:', err);
        apiClient.setAuthToken(null);
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth state transitions (sign in, sign out, token refresh)
    const { data: authListener } = supabase?.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) return;

        if (event === 'SIGNED_OUT' || !currentSession) {
          apiClient.setAuthToken(null);
          setSession(null);
          setUser(null);
          setIsLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED' && currentSession) {
          apiClient.setAuthToken(currentSession.access_token);
          setSession(currentSession);
        }
      }
    ) ?? { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile]);

  /**
   * Log into Supabase Auth with email & password, then verify with Express backend.
   */
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    setIsLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase) {
      const err = 'Authentication service is not configured. Please check connection.';
      setError(err);
      setIsLoading(false);
      return { success: false, error: err };
    }

    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInErr || !data.session) {
        const errorMsg = 'Invalid email or password. Please check your credentials.';
        setError(errorMsg);
        setIsLoading(false);
        return { success: false, error: errorMsg };
      }

      // Sync bearer token
      apiClient.setAuthToken(data.session.access_token);
      setSession(data.session);

      // Verify and resolve server role
      try {
        const profile = await fetchUserProfile();
        if (!profile) {
          throw new Error('Authorized user record not found.');
        }

        setUser(profile);
        setIsLoading(false);
        return { success: true };
      } catch (profileErr) {
        // If inactive account or error, terminate session immediately
        await supabase.auth.signOut();
        apiClient.setAuthToken(null);
        setSession(null);
        setUser(null);

        const errorMsg =
          profileErr instanceof Error
            ? profileErr.message
            : 'Authentication denied by server authorization.';
        setError(errorMsg);
        setIsLoading(false);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during login.';
      setError(errorMsg);
      setIsLoading(false);
      return { success: false, error: errorMsg };
    }
  };

  /**
   * Terminate active session and clear all authentication tokens.
   */
  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      // Notify backend audit trail
      try {
        await apiClient.post('/auth/logout');
      } catch {
        // non-blocking
      }

      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      apiClient.setAuthToken(null);
      setSession(null);
      setUser(null);
      setError(null);
      setIsLoading(false);
    }
  };

  const refreshUser = async (): Promise<void> => {
    try {
      const profile = await fetchUserProfile();
      setUser(profile);
    } catch {
      // Keep existing state
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        error,
        login,
        logout,
        clearError,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

