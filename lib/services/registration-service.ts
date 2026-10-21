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
  return rows.map((row) => ({ ...row, captain: profiles.get(row.captain_id), tournament: tournaments.get(row.tournament_id), members: members.get(row.id) || [] }));
}

export async function getRegistrationsByTournament(tournamentId: string): Promise<Registration[]> {
  if (!isSupabaseConfigured()) {
    const store = getStore();
    return store.registrations.filter((r) => r.tournament_id === tournamentId).map((r) => ({
      ...r, captain: store.profiles.find((p) => p.id === r.captain_id), tournament: store.tournaments.find((t) => t.id === r.tournament_id),
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
    return store.registrations.filter((r) => r.captain_id === userId).map((r) => ({
      ...r, captain: store.profiles.find((p) => p.id === r.captain_id), tournament: store.tournaments.find((t) => t.id === r.tournament_id),
    }));
  }
  const { data, error } = await createClient().from('registrations').select('*').eq('captain_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return attachRelatedData((data || []) as Registration[]);
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
    const members = [{ ign: input.ign.trim(), uid: input.uid.trim() }, ...(input.teammates || []).map((member) => ({ ign: member.ign.trim(), uid: member.uid.trim() }))];
    const { data, error } = await createClient().rpc('register_tournament_atomic', {
      p_tournament_id: input.tournamentId,
      p_captain_id: input.captainId,
      p_team_name: input.teamName || input.ign,
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
  (input.teammates || []).forEach((member, index) => {
    const linkedProfile = store.profiles.find((profile) => tournament.game === 'BGMI'
      ? profile.bgmi_uid === member.uid
      : profile.free_fire_uid === member.uid);
    members.push({ id: `m-${Date.now()}-${index + 1}`, registration_id: id, player_id: linkedProfile?.id, ign: member.ign, uid: member.uid, role: 'member', created_at: new Date().toISOString() });
  });
  const registration: Registration = {
    id, tournament_id: input.tournamentId, captain_id: input.captainId,
    team_name: input.teamName || input.ign,
    registration_code: `VYR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: (isFree ? 'confirmed' : 'pending_payment') as RegistrationStatus,
    slot_number: active.length + 1, members,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  store.registrations.push(registration);
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
