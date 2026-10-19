import { Registration, RegistrationStatus, RegistrationMember } from '../supabase/types';
import { getStore, persistStore } from './store';
import { logAdminAction } from './audit-service';

export interface RegisterInput {
  tournamentId: string;
  captainId: string;
  teamName?: string;
  ign: string;
  uid: string;
  teammates?: Array<{ ign: string; uid: string }>;
}

export async function getRegistrationsByTournament(tournamentId: string): Promise<Registration[]> {
  const store = getStore();
  return store.registrations
    .filter(r => r.tournament_id === tournamentId)
    .map(r => ({
      ...r,
      captain: store.profiles.find(p => p.id === r.captain_id),
      tournament: store.tournaments.find(t => t.id === r.tournament_id),
    }));
}

export async function getUserRegistrations(userId: string): Promise<Registration[]> {
  const store = getStore();
  return store.registrations
    .filter(r => r.captain_id === userId)
    .map(r => ({
      ...r,
      captain: store.profiles.find(p => p.id === r.captain_id),
      tournament: store.tournaments.find(t => t.id === r.tournament_id),
    }));
}

export async function getRegistrationById(id: string): Promise<Registration | null> {
  const store = getStore();
  const reg = store.registrations.find(r => r.id === id);
  if (!reg) return null;

  return {
    ...reg,
    captain: store.profiles.find(p => p.id === reg.captain_id),
    tournament: store.tournaments.find(t => t.id === reg.tournament_id),
  };
}

export async function registerForTournament(input: RegisterInput): Promise<{
  success: boolean;
  registration?: Registration;
  error?: string;
}> {
  const store = getStore();

  // 1. Validate tournament exists and is open
  const tournament = store.tournaments.find(t => t.id === input.tournamentId);
  if (!tournament) {
    return { success: false, error: 'Tournament not found' };
  }

  if (tournament.status !== 'open') {
    return { success: false, error: `Tournament registration is currently ${tournament.status}` };
  }

  const now = new Date().getTime();
  if (now < new Date(tournament.registration_opens_at).getTime()) {
    return { success: false, error: 'Registration has not opened yet' };
  }
  if (now > new Date(tournament.registration_closes_at).getTime()) {
    return { success: false, error: 'Registration has closed for this tournament' };
  }

  // 2. Prevent duplicate registration
  const existingReg = store.registrations.find(
    r => r.tournament_id === input.tournamentId && r.captain_id === input.captainId
  );
  if (existingReg) {
    return { success: false, error: 'You are already registered for this tournament' };
  }

  // 3. Slot capacity check
  const activeRegistrations = store.registrations.filter(
    r => r.tournament_id === input.tournamentId && ['confirmed', 'payment_submitted', 'pending_payment'].includes(r.status)
  );
  if (activeRegistrations.length >= tournament.max_slots) {
    return { success: false, error: 'Tournament has reached maximum slot capacity' };
  }

  // 4. Determine initial status: Free -> confirmed, Paid -> pending_payment
  const isFree = tournament.entry_fee_paise === 0;
  const initialStatus: RegistrationStatus = isFree ? 'confirmed' : 'pending_payment';

  const regId = `reg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const regCode = `VYR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const members: RegistrationMember[] = [
    {
      id: `m-${Date.now()}-0`,
      registration_id: regId,
      player_id: input.captainId,
      ign: input.ign,
      uid: input.uid,
      role: 'captain',
      created_at: new Date().toISOString(),
    },
  ];

  if (input.teammates && input.teammates.length > 0) {
    input.teammates.forEach((tm, idx) => {
      members.push({
        id: `m-${Date.now()}-${idx + 1}`,
        registration_id: regId,
        ign: tm.ign,
        uid: tm.uid,
        role: 'member',
        created_at: new Date().toISOString(),
      });
    });
  }

  const newReg: Registration = {
    id: regId,
    tournament_id: input.tournamentId,
    captain_id: input.captainId,
    team_name: input.teamName || input.ign,
    registration_code: regCode,
    status: initialStatus,
    slot_number: activeRegistrations.length + 1,
    members,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.registrations.push(newReg);

  // If free tournament, increase player's tournament count
  if (isFree) {
    const playerProfile = store.profiles.find(p => p.id === input.captainId);
    if (playerProfile) {
      playerProfile.total_tournaments += 1;
    }
  }

  persistStore(store);

  return {
    success: true,
    registration: {
      ...newReg,
      captain: store.profiles.find(p => p.id === input.captainId),
      tournament,
    },
  };
}

export async function disqualifyParticipant(
  registrationId: string,
  reason: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  const store = getStore();
  const reg = store.registrations.find(r => r.id === registrationId);
  if (!reg) return { success: false, error: 'Registration not found' };

  reg.status = 'disqualified';
  reg.disqualification_reason = reason;
  reg.updated_at = new Date().toISOString();
  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'PARTICIPANT_DISQUALIFIED',
    targetEntity: 'registrations',
    targetId: registrationId,
    metadata: { reason, team_name: reg.team_name, registration_code: reg.registration_code },
  });

  return { success: true };
}
