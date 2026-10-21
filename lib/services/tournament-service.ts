import { Tournament, TournamentStatus, TournamentMode } from '../supabase/types';
import { getStore, isSupabaseConfigured, persistStore } from './store';
import { createClient } from '../supabase/client';
import { logAdminAction } from './audit-service';
import { rebuildLocalPlayerRankings } from './rating-service';

export interface TournamentFilters {
  search?: string;
  game?: 'all' | 'BGMI' | 'Free Fire';
  status?: TournamentStatus | 'all';
  mode?: TournamentMode | 'all';
  feeType?: 'all' | 'free' | 'paid';
  sortBy?: 'start_time_asc' | 'start_time_desc' | 'prize_desc';
}

const TOURNAMENT_FIELDS = 'id,title,slug,description,game,mode,team_size,tournament_format,entry_fee_paise,prize_pool_paise,prize_distribution,max_slots,registration_opens_at,registration_closes_at,start_time,rules,banner_url,status,cancellation_reason,room_release_policy,room_released,created_by,created_at,updated_at';
const ACTIVE_REGISTRATION_STATUSES = ['confirmed', 'payment_submitted', 'pending_payment'];

async function withRegistrationCounts(tournaments: Tournament[]) {
  if (!tournaments.length) return tournaments;
  const ids = tournaments.map((tournament) => tournament.id);
  const { data, error } = await createClient().rpc('get_tournament_registration_counts', { p_tournament_ids: ids });
  if (error) throw error;
  const counts = (data || {}) as Record<string, number>;
  return tournaments.map((tournament) => ({ ...tournament, registered_count: Number(counts[tournament.id] || 0) }));
}

export async function getTournaments(filters: TournamentFilters = {}): Promise<Tournament[]> {
  if (!isSupabaseConfigured()) {
    const store = getStore();
    let list = [...store.tournaments].map((t) => ({
      ...t,
      registered_count: store.registrations.filter((r) => r.tournament_id === t.id && ACTIVE_REGISTRATION_STATUSES.includes(r.status)).length,
    }));
    if (filters.search) list = list.filter((t) => `${t.title} ${t.game}`.toLowerCase().includes(filters.search!.toLowerCase()));
    if (filters.game && filters.game !== 'all') list = list.filter((t) => t.game === filters.game);
    if (filters.status && filters.status !== 'all') list = list.filter((t) => t.status === filters.status);
    if (filters.mode && filters.mode !== 'all') list = list.filter((t) => t.mode === filters.mode);
    if (filters.feeType === 'free') list = list.filter((t) => t.entry_fee_paise === 0);
    if (filters.feeType === 'paid') list = list.filter((t) => t.entry_fee_paise > 0);
    list.sort((a, b) => filters.sortBy === 'prize_desc'
      ? b.prize_pool_paise - a.prize_pool_paise
      : (filters.sortBy === 'start_time_desc' ? -1 : 1) * (new Date(a.start_time).getTime() - new Date(b.start_time).getTime()));
    return list;
  }

  let query = createClient().from('tournaments').select(TOURNAMENT_FIELDS);
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  else query = query.neq('status', 'draft');
  if (filters.mode && filters.mode !== 'all') query = query.eq('mode', filters.mode);
  if (filters.game && filters.game !== 'all') query = query.eq('game', filters.game);
  if (filters.feeType === 'free') query = query.eq('entry_fee_paise', 0);
  if (filters.feeType === 'paid') query = query.gt('entry_fee_paise', 0);
  if (filters.search) query = query.or(`title.ilike.%${filters.search.replace(/[,()%]/g, '')}%,game.ilike.%${filters.search.replace(/[,()%]/g, '')}%`);
  query = filters.sortBy === 'prize_desc'
    ? query.order('prize_pool_paise', { ascending: false })
    : query.order('start_time', { ascending: filters.sortBy !== 'start_time_desc' });
  const { data, error } = await query;
  if (error) throw error;
  return withRegistrationCounts((data || []) as Tournament[]);
}

export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  if (!isSupabaseConfigured()) {
    const t = getStore().tournaments.find((x) => x.slug === slug);
    if (!t) return null;
    const registered_count = getStore().registrations.filter((r) => r.tournament_id === t.id && ACTIVE_REGISTRATION_STATUSES.includes(r.status)).length;
    return { ...t, registered_count };
  }
  const { data, error } = await createClient().from('tournaments').select(TOURNAMENT_FIELDS).eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withRegistrationCounts([data as Tournament]))[0];
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
  if (!isSupabaseConfigured()) {
    const t = getStore().tournaments.find((x) => x.id === id);
    if (!t) return null;
    return { ...t, registered_count: getStore().registrations.filter((r) => r.tournament_id === t.id && ACTIVE_REGISTRATION_STATUSES.includes(r.status)).length };
  }
  const { data, error } = await createClient().from('tournaments').select(TOURNAMENT_FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withRegistrationCounts([data as Tournament]))[0];
}

export async function createTournament(
  data: Omit<Tournament, 'id' | 'created_at' | 'updated_at' | 'registered_count'>,
  adminId: string
): Promise<Tournament> {
  if (isSupabaseConfigured()) {
    const { data: created, error } = await createClient().from('tournaments')
      .insert({ ...data, created_by: adminId }).select(TOURNAMENT_FIELDS).single();
    if (error) throw error;
    await logAdminAction({ actorId: adminId, action: 'TOURNAMENT_CREATED', targetEntity: 'tournaments', targetId: created.id, metadata: { title: created.title } });
    return { ...created, registered_count: 0 } as Tournament;
  }

  const store = getStore();
  const id = `t-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newTournament: Tournament = { ...data, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), registered_count: 0 };
  store.tournaments.unshift(newTournament);
  persistStore(store);
  await logAdminAction({ actorId: adminId, action: 'TOURNAMENT_CREATED', targetEntity: 'tournaments', targetId: id, metadata: { title: newTournament.title } });
  return newTournament;
}

export async function updateTournament(id: string, data: Partial<Tournament>, adminId: string): Promise<Tournament | null> {
  if (isSupabaseConfigured()) {
    const safeData = { ...data, updated_at: new Date().toISOString() } as Record<string, unknown>;
    delete safeData.id; delete safeData.created_at; delete safeData.registered_count;
    const { data: updated, error } = await createClient().from('tournaments').update(safeData).eq('id', id).select(TOURNAMENT_FIELDS).maybeSingle();
    if (error) throw error;
    if (!updated) return null;
    await logAdminAction({ actorId: adminId, action: 'TOURNAMENT_UPDATED', targetEntity: 'tournaments', targetId: id, metadata: { title: updated.title, status: updated.status } });
    return updated as Tournament;
  }
  const store = getStore();
  const index = store.tournaments.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const previousStatus = store.tournaments[index].status;
  const updated = { ...store.tournaments[index], ...data, updated_at: new Date().toISOString() };
  store.tournaments[index] = updated; persistStore(store);
  if (updated.status === 'cancelled' && previousStatus !== 'cancelled') {
    store.ratingEvents = store.ratingEvents.filter((event) => event.tournament_id !== id);
    store.prizeAwards = (store.prizeAwards || []).filter((award) => award.tournament_id !== id || award.status === 'paid');
    persistStore(store);
    rebuildLocalPlayerRankings();
  }
  await logAdminAction({ actorId: adminId, action: 'TOURNAMENT_UPDATED', targetEntity: 'tournaments', targetId: id, metadata: { title: updated.title, status: updated.status } });
  return updated;
}

export async function updateTournamentStatus(id: string, status: TournamentStatus, cancellationReason: string | undefined, adminId: string): Promise<Tournament | null> {
  return updateTournament(id, { status, cancellation_reason: cancellationReason }, adminId);
}

export async function deleteArchivedTournament(id: string, adminId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('delete_archived_tournament', { p_tournament_id: id });
    if (error) throw error;
    const result = data as { success?: boolean; error?: string } | null;
    if (!result?.success) throw new Error(result?.error || 'Could not delete the archived event. Apply migration 007 and try again.');
    return;
  }

  const store = getStore();
  const tournament = store.tournaments.find((item) => item.id === id);
  if (!tournament) throw new Error('Event not found.');
  if (tournament.status !== 'completed' && tournament.status !== 'cancelled') {
    throw new Error('Only completed or cancelled events can be deleted.');
  }
  const registrations = store.registrations.filter((registration) => registration.tournament_id === id);
  const registrationIds = new Set(registrations.map((registration) => registration.id));
  const matchIds = new Set(store.matches.filter((match) => match.tournament_id === id).map((match) => match.id));
  store.tournaments = store.tournaments.filter((item) => item.id !== id);
  store.registrations = store.registrations.filter((registration) => registration.tournament_id !== id);
  store.matches = store.matches.filter((match) => match.tournament_id !== id);
  store.announcements = store.announcements.filter((announcement) => announcement.tournament_id !== id);
  store.ratingEvents = store.ratingEvents.filter((event) => event.tournament_id !== id && (!event.match_id || !matchIds.has(event.match_id)));
  store.prizeAwards = store.prizeAwards.filter((award) => award.tournament_id !== id);
  persistStore(store);
  rebuildLocalPlayerRankings();
  await logAdminAction({ actorId: adminId, action: 'ARCHIVED_TOURNAMENT_DELETED', targetEntity: 'tournaments', targetId: id, metadata: { title: tournament.title, removed_registrations: registrationIds.size } });
}

export async function releaseRoomDetails(id: string, roomId: string, roomPassword: string, adminId: string): Promise<Tournament | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('tournaments').update({
      room_id: roomId, room_password: roomPassword, room_released: true, updated_at: new Date().toISOString(),
    }).eq('id', id).select(TOURNAMENT_FIELDS).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    await logAdminAction({ actorId: adminId, action: 'ROOM_DETAILS_RELEASED', targetEntity: 'tournaments', targetId: id, metadata: { title: data.title } });
    return data as Tournament;
  }
  const store = getStore();
  const tournament = store.tournaments.find((t) => t.id === id);
  if (!tournament) return null;
  tournament.room_id = roomId; tournament.room_password = roomPassword; tournament.room_released = true; tournament.updated_at = new Date().toISOString();
  persistStore(store);
  await logAdminAction({ actorId: adminId, action: 'ROOM_DETAILS_RELEASED', targetEntity: 'tournaments', targetId: id, metadata: { title: tournament.title } });
  return tournament;
}

export async function getTournamentRoomCredentials(id: string): Promise<{ room_id: string | null; room_password: string | null } | null> {
  if (!isSupabaseConfigured()) {
    const t = getStore().tournaments.find((item) => item.id === id);
    return t?.room_released ? { room_id: t.room_id || null, room_password: t.room_password || null } : null;
  }
  const { data, error } = await createClient().rpc('get_tournament_room_credentials', { p_tournament_id: id });
  if (error) throw error;
  return data as { room_id: string | null; room_password: string | null } | null;
}
