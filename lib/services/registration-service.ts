import { Registration, RegistrationStatus, RegistrationMember, Profile, Tournament } from '../supabase/types';
import { getStore, isSupabaseConfigured, persistStore } from './store';
import { createClient } from '../supabase/client';
import { logAdminAction } from './audit-service';

export interface RegisterInput {
  tournamentId: string;
  captainId: string;
  teamName?: string;
  ign: string;
  uid: string;
  teammates?: Array<{ ign: string; uid: string }>;
}

export interface TournamentTeamSummary {
  registration_id: string;
  team_name: string;
  leader_name: string;
  registration_status: RegistrationStatus;
  member_count: number;
  team_size: number;
  is_my_team: boolean;
  request_status: 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
}

export interface TournamentTeamRequest {
  request_id: string;
  registration_id: string;
  player_id: string;
  display_name: string;
  username: string;
  game_ign: string | null;
  game_uid: string | null;
  created_at: string;
}

export interface TournamentTeamOverview {
  teams: TournamentTeamSummary[];
  requests: TournamentTeamRequest[];
  my_team: null | {
    registration_id: string;
    team_name: string | null;
    is_leader: boolean;
    member_count: number;
    team_size: number;
    members: Array<{
      player_id: string | null;
      display_name: string | null;
      username: string | null;
      ign: string;
      uid: string;
      role: RegistrationMember['role'];
    }>;
  };
}

export interface TeamActionResult {
  success: boolean;
  error?: string;
}

async function attachRelatedData(rows: Registration[]): Promise<Registration[]> {
  if (!rows.length) return [];
  const supabase = createClient();
  const captainIds = [...new Set(rows.map((row) => row.captain_id))];
  const tournamentIds = [...new Set(rows.map((row) => row.tournament_id))];
  const registrationIds = rows.map((row) => row.id);
  const [profilesResult, tournamentsResult, membersResult] = await Promise.all([
    supabase.from('profiles').select('*').in('id', captainIds),
    supabase.from('tournaments').select('id,title,slug,description,game,mode,team_size,tournament_format,entry_fee_paise,prize_pool_paise,prize_distribution,max_slots,registration_opens_at,registration_closes_at,start_time,rules,banner_url,status,cancellation_reason,room_release_policy,room_released,created_by,created_at,updated_at').in('id', tournamentIds),
    supabase.from('registration_members').select('*').in('registration_id', registrationIds),
  ]);
  for (const result of [profilesResult, tournamentsResult, membersResult]) if (result.error) throw result.error;
  const profiles = new Map((profilesResult.data || []).map((profile) => [profile.id, profile as Profile]));
  const tournaments = new Map((tournamentsResult.data || []).map((tournament) => [tournament.id, tournament as Tournament]));
  const members = new Map<string, RegistrationMember[]>();
  for (const member of (membersResult.data || []) as RegistrationMember[]) {
    const list = members.get(member.registration_id) || [];
    list.push(member); members.set(member.registration_id, list);
  }
  const additionalProfileIds = [...new Set(
    Array.from(members.values())
      .flatMap((list) => list.map((member) => member.player_id))
      .filter((id): id is string => Boolean(id) && !profiles.has(id))
  )];
  if (additionalProfileIds.length) {
    const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', additionalProfileIds);
    if (error) throw error;
    for (const profile of data || []) profiles.set(profile.id, profile as Profile);
  }
  return rows.map((row) => ({
    ...row,
    captain: profiles.get(row.captain_id),
    tournament: tournaments.get(row.tournament_id),
    members: (members.get(row.id) || []).map((member) => ({
      ...member,
      profile: member.player_id ? profiles.get(member.player_id) : undefined,
    })),
  }));
}

export async function getRegistrationsByTournament(tournamentId: string): Promise<Registration[]> {
  if (!isSupabaseConfigured()) {
    const store = getStore();
    return store.registrations.filter((r) => r.tournament_id === tournamentId).map((r) => ({
      ...r,
      captain: store.profiles.find((p) => p.id === r.captain_id),
      tournament: store.tournaments.find((t) => t.id === r.tournament_id),
      members: (r.members || []).map((member) => ({ ...member, profile: store.profiles.find((profile) => profile.id === member.player_id) })),
    }));
  }
  const { data, error } = await createClient().from('registrations').select('*').eq('tournament_id', tournamentId).order('created_at');
  if (error) throw error;
  return attachRelatedData((data || []) as Registration[]);
}

export async function getAllRegistrations(): Promise<Registration[]> {
  if (!isSupabaseConfigured()) {
    const store = getStore();
    return store.registrations.map((r) => ({ ...r, captain: store.profiles.find((p) => p.id === r.captain_id), tournament: store.tournaments.find((t) => t.id === r.tournament_id) }));
  }
  const { data, error } = await createClient().from('registrations').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return attachRelatedData((data || []) as Registration[]);
}

export async function getUserRegistrations(userId: string): Promise<Registration[]> {
  if (!isSupabaseConfigured()) {
    const store = getStore();
    return store.registrations.filter((r) => r.captain_id === userId || r.members?.some((member) => member.player_id === userId)).map((r) => ({
      ...r, captain: store.profiles.find((p) => p.id === r.captain_id), tournament: store.tournaments.find((t) => t.id === r.tournament_id),
    }));
  }
  const supabase = createClient();
  const [captainResult, memberResult] = await Promise.all([
    supabase.from('registrations').select('*').eq('captain_id', userId),
    supabase.from('registration_members').select('registration_id').eq('player_id', userId),
  ]);
  if (captainResult.error) throw captainResult.error;
  if (memberResult.error) throw memberResult.error;
  const registrationIds = [...new Set([
    ...(captainResult.data || []).map((registration) => registration.id),
    ...(memberResult.data || []).map((member) => member.registration_id),
  ])];
  if (!registrationIds.length) return [];
  const { data, error } = await supabase.from('registrations').select('*').in('id', registrationIds).order('created_at', { ascending: false });
  if (error) throw error;
  return attachRelatedData((data || []) as Registration[]);
}

export async function getTournamentTeamOverview(tournamentId: string, userId?: string): Promise<TournamentTeamOverview> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('get_tournament_team_overview', { p_tournament_id: tournamentId });
    if (error) throw error;
    return (data || { teams: [], requests: [], my_team: null }) as TournamentTeamOverview;
  }

  const store = getStore();
  const tournament = store.tournaments.find((item) => item.id === tournamentId);
  const teams = store.registrations
    .filter((registration) => registration.tournament_id === tournamentId && registration.team_name && ['confirmed', 'payment_submitted', 'pending_payment'].includes(registration.status))
    .map((registration) => ({
      registration_id: registration.id,
      team_name: registration.team_name || '',
      leader_name: store.profiles.find((profile) => profile.id === registration.captain_id)?.display_name || 'Team leader',
      registration_status: registration.status,
      member_count: registration.members?.length || 0,
      team_size: tournament?.team_size || 1,
      is_my_team: registration.captain_id === userId || Boolean(registration.members?.some((member) => member.player_id === userId)),
      request_status: null,
    }));
  const ownRegistration = store.registrations.find((registration) => registration.tournament_id === tournamentId && ['confirmed', 'payment_submitted', 'pending_payment'].includes(registration.status) && (registration.captain_id === userId || registration.members?.some((member) => member.player_id === userId)));
  return {
    teams,
    requests: [],
    my_team: ownRegistration ? {
      registration_id: ownRegistration.id,
      team_name: ownRegistration.team_name || null,
      is_leader: ownRegistration.captain_id === userId,
      member_count: ownRegistration.members?.length || 0,
      team_size: tournament?.team_size || 1,
      members: (ownRegistration.members || []).map((member) => {
        const profile = store.profiles.find((item) => item.id === member.player_id);
        return { player_id: member.player_id || null, display_name: profile?.display_name || null, username: profile?.username || null, ign: member.ign, uid: member.uid, role: member.role };
      }),
    } : null,
  };
}

async function callTeamAction(functionName: string, args: Record<string, unknown>): Promise<TeamActionResult> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Team requests are available when the tournament database is connected.' };
  const { data, error } = await createClient().rpc(functionName, args);
  if (error) return { success: false, error: error.message };
  const result = data as { success?: boolean; error?: string } | null;
  return result?.success ? { success: true } : { success: false, error: result?.error || 'The team action could not be completed.' };
}

export function requestToJoinTournamentTeam(registrationId: string): Promise<TeamActionResult> {
  return callTeamAction('request_to_join_tournament_team', { p_registration_id: registrationId });
}

export function reviewTournamentTeamRequest(requestId: string, approve: boolean): Promise<TeamActionResult> {
  return callTeamAction('review_tournament_team_request', { p_request_id: requestId, p_approve: approve });
}

export function transferTournamentTeamLeadership(registrationId: string, newLeaderId: string): Promise<TeamActionResult> {
  return callTeamAction('transfer_tournament_team_leadership', { p_registration_id: registrationId, p_new_leader_id: newLeaderId });
}

export function leaveTournamentTeam(registrationId: string): Promise<TeamActionResult> {
  return callTeamAction('leave_tournament_team', { p_registration_id: registrationId });
}

export async function getRegistrationById(id: string): Promise<Registration | null> {
  if (!isSupabaseConfigured()) {
    const store = getStore();
    const reg = store.registrations.find((r) => r.id === id);
    return reg ? { ...reg, captain: store.profiles.find((p) => p.id === reg.captain_id), tournament: store.tournaments.find((t) => t.id === reg.tournament_id) } : null;
  }
  const { data, error } = await createClient().from('registrations').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? (await attachRelatedData([data as Registration]))[0] : null;
}

export async function registerForTournament(input: RegisterInput): Promise<{ success: boolean; registration?: Registration; error?: string }> {
  if (isSupabaseConfigured()) {
    const members = [{ ign: input.ign.trim(), uid: input.uid.trim() }];
    const { data, error } = await createClient().rpc('register_tournament_atomic', {
      p_tournament_id: input.tournamentId,
      p_captain_id: input.captainId,
      p_team_name: input.teamName?.trim() || null,
      p_members: members,
    });
    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Registration failed.' };
    const registration = await getRegistrationById(data.registration_id);
    return registration ? { success: true, registration } : { success: false, error: 'Registration completed, but could not load its details.' };
  }

  const store = getStore();
  const tournament = store.tournaments.find((t) => t.id === input.tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found' };
  if (tournament.status !== 'open') return { success: false, error: `Tournament registration is currently ${tournament.status}` };
  const now = Date.now();
  if (now < new Date(tournament.registration_opens_at).getTime()) return { success: false, error: 'Registration has not opened yet' };
  if (now > new Date(tournament.registration_closes_at).getTime()) return { success: false, error: 'Registration has closed for this tournament' };
  if (store.registrations.some((r) => r.tournament_id === input.tournamentId && r.captain_id === input.captainId)) return { success: false, error: 'You are already registered for this tournament' };
  const active = store.registrations.filter((r) => r.tournament_id === input.tournamentId && ['confirmed', 'payment_submitted', 'pending_payment'].includes(r.status));
  if (active.length >= tournament.max_slots) return { success: false, error: 'Tournament has reached maximum slot capacity' };
  const isFree = tournament.entry_fee_paise === 0;
  const id = `reg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const members: RegistrationMember[] = [{ id: `m-${Date.now()}-0`, registration_id: id, player_id: input.captainId, ign: input.ign, uid: input.uid, role: 'captain', created_at: new Date().toISOString() }];
  const registration: Registration = {
    id, tournament_id: input.tournamentId, captain_id: input.captainId,
    team_name: tournament.team_size > 1 ? input.teamName?.trim() || null : null,
    registration_code: `VYR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: (isFree ? 'confirmed' : 'pending_payment') as RegistrationStatus,
    slot_number: active.length + 1, members,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  store.registrations.push(registration);
  if (registration.team_name) {
    const teamKey = `${tournament.game.toLowerCase()}:${registration.team_name.trim().toLowerCase()}`;
    store.deletedTeams = (store.deletedTeams || []).filter((key) => key !== teamKey);
  }
  persistStore(store);
  return { success: true, registration: { ...registration, captain: store.profiles.find((p) => p.id === input.captainId), tournament } };
}

export async function disqualifyParticipant(registrationId: string, reason: string, adminId: string): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('disqualify_registration', { p_registration_id: registrationId, p_reason: reason });
    if (error) return { success: false, error: error.message };
    return data?.success ? { success: true } : { success: false, error: data?.error || 'Registration not found.' };
  }
  const store = getStore();
  const reg = store.registrations.find((r) => r.id === registrationId);
  if (!reg) return { success: false, error: 'Registration not found' };
  reg.status = 'disqualified'; reg.disqualification_reason = reason; reg.updated_at = new Date().toISOString(); persistStore(store);
  await logAdminAction({ actorId: adminId, action: 'PARTICIPANT_DISQUALIFIED', targetEntity: 'registrations', targetId: registrationId, metadata: { reason } });
  return { success: true };
}
