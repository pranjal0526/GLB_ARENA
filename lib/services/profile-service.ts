import { Profile } from '../supabase/types';
import { getStore } from './store';
import { logAdminAction } from './audit-service';

export async function getProfile(userId: string): Promise<Profile | null> {
  const store = getStore();
  const profile = store.profiles.find(p => p.id === userId);
  return profile || null;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const store = getStore();
  const profile = store.profiles.find(p => p.username.toLowerCase() === username.toLowerCase());
  return profile || null;
}

export async function getAllProfiles(): Promise<Profile[]> {
  const store = getStore();
  return store.profiles;
}

export async function getLeaderboard(): Promise<Profile[]> {
  const store = getStore();
  return [...store.profiles].sort((a, b) => {
    if (b.current_rating !== a.current_rating) {
      return b.current_rating - a.current_rating;
    }
    if (b.total_wins !== a.total_wins) {
      return b.total_wins - a.total_wins;
    }
    return b.total_kills - a.total_kills;
  });
}

export async function updateProfile(
  userId: string,
  data: Partial<Pick<Profile, 'display_name' | 'bgmi_ign' | 'bgmi_uid' | 'avatar_url'>>
): Promise<Profile | null> {
  const store = getStore();
  const profile = store.profiles.find(p => p.id === userId);
  if (!profile) return null;

  if (data.display_name) profile.display_name = data.display_name;
  if (data.bgmi_ign) profile.bgmi_ign = data.bgmi_ign;
  if (data.bgmi_uid) profile.bgmi_uid = data.bgmi_uid;
  if (data.avatar_url) profile.avatar_url = data.avatar_url;
  profile.updated_at = new Date().toISOString();

  return profile;
}

export async function banUser(
  userId: string,
  reason: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  const store = getStore();
  const profile = store.profiles.find(p => p.id === userId);
  if (!profile) return { success: false, error: 'User not found' };

  profile.account_status = 'banned';
  profile.ban_reason = reason;
  profile.banned_at = new Date().toISOString();
  profile.updated_at = new Date().toISOString();

  await logAdminAction({
    actorId: adminId,
    action: 'PLAYER_BANNED',
    targetEntity: 'profiles',
    targetId: userId,
    metadata: { username: profile.username, reason },
  });

  return { success: true };
}

export async function unbanUser(
  userId: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  const store = getStore();
  const profile = store.profiles.find(p => p.id === userId);
  if (!profile) return { success: false, error: 'User not found' };

  profile.account_status = 'active';
  profile.ban_reason = null;
  profile.banned_at = null;
  profile.updated_at = new Date().toISOString();

  await logAdminAction({
    actorId: adminId,
    action: 'PLAYER_UNBANNED',
    targetEntity: 'profiles',
    targetId: userId,
    metadata: { username: profile.username },
  });

  return { success: true };
}
