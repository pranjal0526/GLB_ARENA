import { Profile, Team } from '../supabase/types';
import { getStore, isSupabaseConfigured, persistStore } from './store';
import { createClient } from '../supabase/client';
import { logAdminAction } from './audit-service';

export async function getProfile(userId: string): Promise<Profile | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }
  return getStore().profiles.find((profile) => profile.id === userId) || null;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('profiles').select('*').ilike('username', username).maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }
  return getStore().profiles.find((profile) => profile.username.toLowerCase() === username.toLowerCase()) || null;
}

export async function getAllProfiles(): Promise<Profile[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Profile[];
  }
  return getStore().profiles;
}

export async function getLeaderboard(): Promise<Profile[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('profiles').select('*')
      .eq('role', 'player').eq('account_status', 'active')
      .order('current_rating', { ascending: false }).order('total_wins', { ascending: false }).order('total_kills', { ascending: false });
    if (error) throw error;
    return (data || []) as Profile[];
  }
  return getStore().profiles.filter((profile) => profile.role === 'player' && profile.account_status === 'active')
    .sort((a, b) => b.current_rating - a.current_rating || b.total_wins - a.total_wins || b.total_kills - a.total_kills);
}

export async function getAllTeams(): Promise<Team[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('teams').select('*').order('name');
    if (error) throw error;
    return (data || []) as Team[];
  }

  const store = getStore();
  const existing = new Map((await getTeamLeaderboard()).map((team) => [`${team.game.toLowerCase()}:${team.name.trim().toLowerCase()}`, team]));
  const grouped = new Map<string, Team>();
  for (const registration of store.registrations) {
    const tournament = store.tournaments.find((item) => item.id === registration.tournament_id);
    if (!tournament || tournament.team_size <= 1) continue;
    const name = (registration.team_name || registration.members?.[0]?.ign || registration.captain?.display_name || 'Team').trim();
    const key = `${tournament.game.toLowerCase()}:${name.toLowerCase()}`;
    if (store.deletedTeams?.includes(key) || grouped.has(key)) continue;
    const rated = existing.get(key);
    grouped.set(key, rated || {
      id: key,
      name,
      game: tournament.game,
      captain_id: registration.captain_id,
      current_rating: 1000,
      highest_rating: 1000,
      tournaments_played: 0,
      total_wins: 0,
      total_kills: 0,
      total_points: 0,
      created_at: registration.created_at,
      updated_at: registration.updated_at,
    });
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteTeam(team: Team, adminId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('admin_delete_team', { p_team_id: team.id });
    if (error) throw error;
    const result = data as { success?: boolean; error?: string } | null;
    if (!result?.success) throw new Error(result?.error || 'Could not delete this team. Apply migration 009 and try again.');
    return;
  }

  const store = getStore();
  const key = `${team.game.toLowerCase()}:${team.name.trim().toLowerCase()}`;
  store.deletedTeams = [...new Set([...(store.deletedTeams || []), key])];
  persistStore(store);
  await logAdminAction({ actorId: adminId, action: 'TEAM_DELETED', targetEntity: 'teams', targetId: team.id, metadata: { name: team.name, game: team.game } });
}

export async function getTeamLeaderboard(): Promise<Team[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('teams').select('*')
      .gt('tournaments_played', 0)
      .order('current_rating', { ascending: false })
      .order('total_wins', { ascending: false })
      .order('total_points', { ascending: false });
    if (error) throw error;
    return (data || []) as Team[];
  }

  const store = getStore();
  const aggregate = new Map<string, Team>();
  for (const match of store.matches.filter((row) => row.status === 'completed')) {
    const tournament = store.tournaments.find((row) => row.id === match.tournament_id);
    if (!tournament || tournament.status === 'cancelled' || tournament.team_size <= 1) continue;
    for (const participant of match.participants || []) {
      const registration = store.registrations.find((row) => row.id === participant.registration_id);
      if (!registration) continue;
      const name = registration.team_name || registration.members?.[0]?.ign || registration.captain?.display_name || 'Team';
      const id = `${tournament.game.toLowerCase()}:${name.trim().toLowerCase()}`;
      const row = aggregate.get(id) || {
        id, name, game: tournament.game, captain_id: registration.captain_id,
        current_rating: 1000, highest_rating: 1000, tournaments_played: 0,
        total_wins: 0, total_kills: 0, total_points: 0,
        created_at: registration.created_at, updated_at: match.updated_at,
      };
      const captainEvents = store.ratingEvents.filter((event) => event.match_id === match.id && event.player_id === registration.captain_id);
      const recordedTeamDelta = participant.stats?.team_rating_change;
      const ratingChange = typeof recordedTeamDelta === 'number'
        ? recordedTeamDelta
        : captainEvents.reduce((sum, event) => sum + event.rating_change, 0);
      row.current_rating = Math.max(500, row.current_rating + ratingChange);
      row.highest_rating = Math.max(row.highest_rating, row.current_rating);
      row.total_wins += participant.is_winner ? 1 : 0;
      row.total_kills += participant.kills || 0;
      row.total_points += participant.points || 0;
      const played = new Set(store.matches.filter((candidate) => candidate.status === 'completed'
        && store.tournaments.find((item) => item.id === candidate.tournament_id)?.status !== 'cancelled')
        .flatMap((candidate) => (candidate.participants || []).filter((entry) => {
          const reg = store.registrations.find((item) => item.id === entry.registration_id);
          return reg && `${tournament.game.toLowerCase()}:${(reg.team_name || reg.members?.[0]?.ign || reg.captain?.display_name || 'Team').trim().toLowerCase()}` === id;
        }).map(() => candidate.tournament_id)));
      row.tournaments_played = played.size;
      aggregate.set(id, row);
    }
  }
  return [...aggregate.values()].sort((a, b) => b.current_rating - a.current_rating || b.total_wins - a.total_wins || b.total_points - a.total_points);
}

export async function updateProfile(
  userId: string,
  data: Partial<Pick<Profile, 'display_name' | 'bgmi_ign' | 'bgmi_uid' | 'free_fire_ign' | 'free_fire_uid' | 'avatar_url'>>
): Promise<Profile | null> {
  if (isSupabaseConfigured()) {
    const { data: updated, error } = await createClient().from('profiles')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', userId).select('*').maybeSingle();
    if (error) throw error;
    return updated as Profile | null;
  }
  const store = getStore();
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) return null;
  Object.assign(profile, data, { updated_at: new Date().toISOString() });
  persistStore(store);
  return profile;
}

export async function getPlayerPhoneNumber(playerId: string): Promise<string | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('player_contact_details')
      .select('phone_number').eq('player_id', playerId).maybeSingle();
    if (error) throw error;
    return data?.phone_number || null;
  }
  return getStore().privateContactDetails?.[playerId] || null;
}

export async function updatePlayerPhoneNumber(playerId: string, phoneNumber: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await createClient().from('player_contact_details').upsert({
      player_id: playerId,
      phone_number: phoneNumber,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'player_id' });
    if (error) throw error;
    return;
  }
  const store = getStore();
  store.privateContactDetails ||= {};
  store.privateContactDetails[playerId] = phoneNumber;
  persistStore(store);
}

async function setAccountStatus(userId: string, status: 'active' | 'banned', reason: string | undefined, adminId: string) {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('set_player_account_status', {
      p_player_id: userId, p_status: status, p_reason: reason || null,
    });
    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Account status update failed.' };
    return { success: true };
  }
  const store = getStore();
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) return { success: false, error: 'User not found' };
  profile.account_status = status; profile.ban_reason = status === 'active' ? null : reason || null;
  profile.banned_at = status === 'active' ? null : new Date().toISOString();
  profile.updated_at = new Date().toISOString(); persistStore(store);
  await logAdminAction({ actorId: adminId, action: status === 'active' ? 'PLAYER_UNBANNED' : 'PLAYER_BANNED', targetEntity: 'profiles', targetId: userId, metadata: { username: profile.username, reason } });
  return { success: true };
}

export async function banUser(userId: string, reason: string, adminId: string) {
  return setAccountStatus(userId, 'banned', reason, adminId);
}

export async function unbanUser(userId: string, adminId: string) {
  return setAccountStatus(userId, 'active', undefined, adminId);
}
