'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile } from './supabase/types';
import { initialProfiles } from './supabase/mock-data';

interface AuthContextType {
  currentUser: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  loginAs: (profileId: string) => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (data: {
    email: string;
    username: string;
    displayName: string;
    bgmiIgn: string;
    bgmiUid: string;
  }) => Promise<{ success: boolean; error?: string }>;
  signOut: () => void;
  updateCurrentUserProfile: (updated: Partial<Profile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Default to player-01 (Mortal Viper) or saved session
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check saved user in localStorage
    const savedUserId = typeof window !== 'undefined' ? localStorage.getItem('vyrox_active_user_id') : null;
    if (savedUserId) {
      const found = initialProfiles.find(p => p.id === savedUserId);
      if (found) {
        setCurrentUser(found);
      } else {
        setCurrentUser(initialProfiles[1]); // default player
      }
    } else {
      setCurrentUser(initialProfiles[1]); // default player
    }
    setIsLoading(false);
  }, []);

  const loginAs = (profileId: string) => {
    const found = initialProfiles.find(p => p.id === profileId);
    if (found) {
      setCurrentUser(found);
      if (typeof window !== 'undefined') {
        localStorage.setItem('vyrox_active_user_id', profileId);
      }
    }
  };

  const signIn = async (email: string): Promise<{ success: boolean; error?: string }> => {
    // Simple authentication logic for local/demo & Supabase fallback
    const emailPrefix = email.split('@')[0].toLowerCase();
    let found = initialProfiles.find(
      p => p.username.toLowerCase() === emailPrefix || p.id === emailPrefix
    );

    if (!found) {
      // Find admin if email has admin
      if (email.includes('admin')) {
        found = initialProfiles[0];
      } else {
        found = initialProfiles[1];
      }
    }

    if (found.account_status === 'banned') {
      return { success: false, error: `Account is banned: ${found.ban_reason || 'Violation of terms'}` };
    }

    setCurrentUser(found);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vyrox_active_user_id', found.id);
    }
    return { success: true };
  };

  const signUp = async (data: {
    email: string;
    username: string;
    displayName: string;
    bgmiIgn: string;
    bgmiUid: string;
  }): Promise<{ success: boolean; error?: string }> => {
    // Check existing
    const exists = initialProfiles.find(
      p => p.username.toLowerCase() === data.username.toLowerCase()
    );
    if (exists) {
      return { success: false, error: 'Username is already taken' };
    }

    const newProfile: Profile = {
      id: `p-${Date.now()}`,
      username: data.username,
      display_name: data.displayName,
      avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${data.username}`,
      bgmi_ign: data.bgmiIgn,
      bgmi_uid: data.bgmiUid,
      role: 'player',
      account_status: 'active',
      current_rating: 1000,
      total_tournaments: 0,
      total_wins: 0,
      total_kills: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    initialProfiles.push(newProfile);
    setCurrentUser(newProfile);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vyrox_active_user_id', newProfile.id);
    }
    return { success: true };
  };

  const signOut = () => {
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vyrox_active_user_id');
    }
  };

  const updateCurrentUserProfile = (updated: Partial<Profile>) => {
    if (!currentUser) return;
    const merged = { ...currentUser, ...updated, updated_at: new Date().toISOString() };
    setCurrentUser(merged);
    const idx = initialProfiles.findIndex(p => p.id === currentUser.id);
    if (idx !== -1) {
      initialProfiles[idx] = merged;
    }
  };

  const isAdmin = currentUser?.role === 'admin' && currentUser?.account_status === 'active';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAdmin,
        isLoading,
        loginAs,
        signIn,
        signUp,
        signOut,
        updateCurrentUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
