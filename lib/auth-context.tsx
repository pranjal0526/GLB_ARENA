'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Profile } from './supabase/types';
import { createClient } from './supabase/client';
import { isSupabaseConfigured } from './services/store';
import { getProfile } from './services/profile-service';

interface SignUpInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
  game: 'BGMI' | 'Free Fire';
  ign: string;
  uid: string;
}

interface AuthContextType {
  currentUser: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string; isAdmin?: boolean }>;
  signInWithGitHub: () => Promise<{ success: boolean; error?: string }>;
  signUp: (data: SignUpInput) => Promise<{ success: boolean; error?: string; emailConfirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  updateCurrentUserProfile: (updated: Partial<Profile>) => void;
  refreshCurrentUserProfile: () => Promise<void>;
}

function getAuthErrorMessage(error: { message?: string; code?: string } | null | undefined, fallback: string) {
  const code = (error?.code || '').toLowerCase();
  const message = (error?.message || '').trim();
  const normalizedMessage = message.toLowerCase();

  if (code === 'over_email_send_rate_limit' || normalizedMessage.includes('email rate limit') || normalizedMessage.includes('over_email_send_rate_limit')) {
    return 'Supabase has temporarily limited confirmation emails for this project. Use GitHub sign-in, wait before trying email registration again, or configure custom SMTP in Supabase Authentication.';
  }
  if (code === 'email_not_confirmed' || normalizedMessage.includes('email not confirmed')) {
    return 'Confirm your email from the link we sent, then sign in. If the link has expired, request a fresh confirmation email after Supabase allows another send.';
  }
  if (code === 'invalid_credentials' || normalizedMessage.includes('invalid login credentials')) {
    return 'Email or password is incorrect. Check your details, or register if you do not have an account yet.';
  }
  if (code === 'user_already_exists' || normalizedMessage.includes('user already registered')) {
    return 'An account already exists with this email. Sign in instead, or use GitHub if that is how you registered.';
  }
  if (code === 'weak_password' || normalizedMessage.includes('password should be')) {
    return 'Use a password with at least 6 characters.';
  }
  if (!message) return fallback;
  if (normalizedMessage.includes('failed to fetch') || normalizedMessage.includes('fetch failed') || normalizedMessage.includes('networkerror')) {
    return 'Could not reach Supabase. Check your internet connection and Supabase project status, then try again.';
  }
  return message;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await createClient()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (error) {
      console.error('Could not initialize the Supabase client:', error);
      setIsLoading(false);
      return () => { isMounted = false; };
    }

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error('Could not restore the Supabase session:', error.message);
        const profile = data.session ? await loadProfile(data.session.user.id) : null;
        if (isMounted) setCurrentUser(profile);
      } catch (profileError) {
        console.error('Could not restore the signed-in player profile:', profileError);
        if (isMounted) setCurrentUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer database reads so they do not run inside Supabase's auth callback lock.
      window.setTimeout(async () => {
        if (!isMounted) return;
        try {
          const profile = session ? await loadProfile(session.user.id) : null;
          if (isMounted) setCurrentUser(profile);
        } catch (profileError) {
          console.error('Could not load the player profile:', profileError);
          if (isMounted) setCurrentUser(null);
        } finally {
          if (isMounted) setIsLoading(false);
        }
      }, 0);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const supabase = isSupabaseConfigured() ? createClient() : null;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const profile = await getProfile(currentUser.id);
        if (profile) setCurrentUser(profile);
      } catch (error) {
        console.error('Could not refresh player stats:', error);
      }
    };
    const channel = supabase
      ? supabase.channel(`profile-updates-${currentUser.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${currentUser.id}` }, (payload) => {
          setCurrentUser(payload.new as Profile);
        }).subscribe()
      : null;
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('vyrox_store_updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('vyrox_store_updated', refresh);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const signIn: AuthContextType['signIn'] = async (email, password) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Connect Supabase to enable player accounts. See the database setup section in README.md.' };
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) return { success: false, error: getAuthErrorMessage(error, 'Sign in failed.') };

      const profile = await loadProfile(data.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        return { success: false, error: 'Sign-in succeeded, but the player profile is missing. Ask the organizer to check the profile trigger and database migrations.' };
      }
      if (profile.account_status !== 'active') {
        setCurrentUser(profile);
        return { success: true, isAdmin: false };
      }
      setCurrentUser(profile);
      return { success: true, isAdmin: profile.role === 'admin' };
    } catch (profileError) {
      try { await createClient().auth.signOut(); } catch { /* Keep the original sign-in error. */ }
      return { success: false, error: getAuthErrorMessage(profileError as { message?: string; code?: string }, 'Could not load your player profile.') };
    }
  };

  const signInWithGitHub: AuthContextType['signInWithGitHub'] = async () => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Connect Supabase to enable GitHub sign-in. See the authentication setup in README.md.' };
    }

    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('provider is not enabled') || error.code === 'provider_disabled' || error.code === 'unsupported_provider') {
          return { success: false, error: 'GitHub sign-in is not enabled in Supabase yet. Enable the GitHub provider and add this site’s /auth/callback URL to the redirect allow list.' };
        }
        return { success: false, error: getAuthErrorMessage(error, 'Could not connect to GitHub.') };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: getAuthErrorMessage(error as { message?: string; code?: string }, 'Could not connect to GitHub.') };
    }
  };

  const signUp: AuthContextType['signUp'] = async (data) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Connect Supabase to create player accounts. See the database setup section in README.md.' };
    }
    if (data.username.trim().length < 3 || data.username.trim().length > 24 || !/^[a-zA-Z0-9_]+$/.test(data.username)) {
      return { success: false, error: 'Username must be 3–24 characters and use only letters, numbers, and underscores.' };
    }
    if (data.password.length < 6 || data.displayName.trim().length < 2 || data.ign.trim().length < 2 || !/^\d{5,}$/.test(data.uid.trim())) {
      return { success: false, error: 'Enter a valid password, display name, in-game name, and numeric player ID.' };
    }
    const metadata = {
      username: data.username.trim(),
      display_name: data.displayName.trim(),
      ...(data.game === 'BGMI'
        ? { bgmi_ign: data.ign.trim(), bgmi_uid: data.uid.trim() }
        : { free_fire_ign: data.ign.trim(), free_fire_uid: data.uid.trim() }),
    };

    try {
      const supabase = createClient();
      const { data: result, error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          data: metadata,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) return { success: false, error: getAuthErrorMessage(error, 'Could not create your account.') };
      if (!result.session || !result.user) {
        return { success: true, emailConfirmationRequired: true };
      }

      const profile = await loadProfile(result.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        return { success: false, error: 'Your account was created, but its player profile is missing. Ask the organizer to check that migrations 001–004 ran successfully.' };
      }
      setCurrentUser(profile);
      return { success: true };
    } catch (profileError) {
      return { success: false, error: getAuthErrorMessage(profileError as { message?: string; code?: string }, 'Could not load your new player profile.') };
    }
  };

  const signOut = async () => {
    if (isSupabaseConfigured()) await createClient().auth.signOut();
    setCurrentUser(null);
  };

  const updateCurrentUserProfile = (updated: Partial<Profile>) => {
    setCurrentUser((user) => user ? { ...user, ...updated, updated_at: new Date().toISOString() } : user);
  };

  const refreshCurrentUserProfile = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const profile = await getProfile(currentUser.id);
      if (profile) setCurrentUser(profile);
    } catch (error) {
      console.error('Could not refresh player profile:', error);
    }
  }, [currentUser?.id]);

  const isAdmin = currentUser?.role === 'admin' && currentUser.account_status === 'active';

  return (
    <AuthContext.Provider value={{ currentUser, isAdmin, isLoading, signIn, signInWithGitHub, signUp, signOut, updateCurrentUserProfile, refreshCurrentUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
