import { Tournament, TournamentStatus, TournamentMode } from '../supabase/types';
import { getStore, persistStore } from './store';
import { logAdminAction } from './audit-service';

export interface TournamentFilters {
  search?: string;
  status?: TournamentStatus | 'all';
  mode?: TournamentMode | 'all';
  feeType?: 'all' | 'free' | 'paid';
  sortBy?: 'start_time_asc' | 'start_time_desc' | 'prize_desc';
}

export async function getTournaments(filters: TournamentFilters = {}): Promise<Tournament[]> {
  const store = getStore();
  let list = [...store.tournaments];

  // Calculate registered count for each
  list = list.map(t => {
    const regCount = store.registrations.filter(
      r => r.tournament_id === t.id && ['confirmed', 'payment_submitted', 'pending_payment'].includes(r.status)
    ).length;
    return { ...t, registered_count: regCount };
  });

  // Filter Search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(t => t.title.toLowerCase().includes(q) || t.game.toLowerCase().includes(q));
  }

  // Filter Status
  if (filters.status && filters.status !== 'all') {
    list = list.filter(t => t.status === filters.status);
  }

  // Filter Mode
  if (filters.mode && filters.mode !== 'all') {
    list = list.filter(t => t.mode === filters.mode);
  }

  // Filter Fee Type
  if (filters.feeType === 'free') {
    list = list.filter(t => t.entry_fee_paise === 0);
  } else if (filters.feeType === 'paid') {
    list = list.filter(t => t.entry_fee_paise > 0);
  }

  // Sort
  if (filters.sortBy === 'prize_desc') {
    list.sort((a, b) => b.prize_pool_paise - a.prize_pool_paise);
  } else if (filters.sortBy === 'start_time_desc') {
    list.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  } else {
    // Default: start_time_asc
    list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }

  return list;
}

export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  const store = getStore();
  const t = store.tournaments.find(x => x.slug === slug);
  if (!t) return null;

  const regCount = store.registrations.filter(
    r => r.tournament_id === t.id && ['confirmed', 'payment_submitted', 'pending_payment'].includes(r.status)
  ).length;

  return { ...t, registered_count: regCount };
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
  const store = getStore();
  const t = store.tournaments.find(x => x.id === id);
  if (!t) return null;

  const regCount = store.registrations.filter(
    r => r.tournament_id === t.id && ['confirmed', 'payment_submitted', 'pending_payment'].includes(r.status)
  ).length;

  return { ...t, registered_count: regCount };
}

export async function createTournament(
  data: Omit<Tournament, 'id' | 'created_at' | 'updated_at' | 'registered_count'>,
  adminId: string
): Promise<Tournament> {
  const store = getStore();

  const id = `t-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newTournament: Tournament = {
    ...data,
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    registered_count: 0,
  };

  store.tournaments.unshift(newTournament);
  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'TOURNAMENT_CREATED',
    targetEntity: 'tournaments',
    targetId: id,
    metadata: { title: newTournament.title, slug: newTournament.slug, max_slots: newTournament.max_slots },
  });

  return newTournament;
}

export async function updateTournament(
  id: string,
  data: Partial<Tournament>,
  adminId: string
): Promise<Tournament | null> {
  const store = getStore();
  const index = store.tournaments.findIndex(t => t.id === id);
  if (index === -1) return null;

  const updated: Tournament = {
    ...store.tournaments[index],
    ...data,
    updated_at: new Date().toISOString(),
  };

  store.tournaments[index] = updated;
  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'TOURNAMENT_UPDATED',
    targetEntity: 'tournaments',
    targetId: id,
    metadata: { title: updated.title, status: updated.status },
  });

  return updated;
}

export async function updateTournamentStatus(
  id: string,
  status: TournamentStatus,
  cancellationReason: string | undefined,
  adminId: string
): Promise<Tournament | null> {
  const store = getStore();
  const tournament = store.tournaments.find(t => t.id === id);
  if (!tournament) return null;

  tournament.status = status;
  if (cancellationReason) {
    tournament.cancellation_reason = cancellationReason;
  }
  tournament.updated_at = new Date().toISOString();
  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: status === 'cancelled' ? 'TOURNAMENT_CANCELLED' : 'TOURNAMENT_STATUS_UPDATED',
    targetEntity: 'tournaments',
    targetId: id,
    metadata: { new_status: status, reason: cancellationReason },
  });

  return tournament;
}

export async function releaseRoomDetails(
  id: string,
  roomId: string,
  roomPassword: string,
  adminId: string
): Promise<Tournament | null> {
  const store = getStore();
  const tournament = store.tournaments.find(t => t.id === id);
  if (!tournament) return null;

  tournament.room_id = roomId;
  tournament.room_password = roomPassword;
  tournament.room_released = true;
  tournament.updated_at = new Date().toISOString();
  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'ROOM_DETAILS_RELEASED',
    targetEntity: 'tournaments',
    targetId: id,
    metadata: { tournament_title: tournament.title },
  });

  return tournament;
}
