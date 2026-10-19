import { Match, MatchParticipant, Registration } from '../supabase/types';
import { getStore, persistStore } from './store';
import { logAdminAction } from './audit-service';
import { calculate1v1Elo, calculateBattleRoyaleRatingDelta, applyRatingEvent } from './rating-service';

export interface ParticipantResultInput {
  registrationId: string;
  placement?: number;
  kills: number;
  points: number;
  isWinner: boolean;
}

export async function getMatchesByTournament(tournamentId: string): Promise<Match[]> {
  const store = getStore();
  const matches = store.matches.filter(m => m.tournament_id === tournamentId);

  return matches.map(m => ({
    ...m,
    participants: (m.participants || []).map(p => ({
      ...p,
      registration: store.registrations.find(r => r.id === p.registration_id),
    })),
  }));
}

export async function getUserMatches(userId: string): Promise<Match[]> {
  const store = getStore();
  const userRegIds = new Set(
    store.registrations.filter(r => r.captain_id === userId).map(r => r.id)
  );

  const matched = store.matches.filter(m =>
    (m.participants || []).some(p => userRegIds.has(p.registration_id))
  );

  return matched.map(m => ({
    ...m,
    participants: (m.participants || []).map(p => ({
      ...p,
      registration: store.registrations.find(r => r.id === p.registration_id),
    })),
  }));
}

/**
 * Deterministic Single Elimination Bracket Generator
 */
export async function generateSingleEliminationFixtures(
  tournamentId: string,
  adminId: string
): Promise<{ success: boolean; matches?: Match[]; error?: string }> {
  const store = getStore();
  const tournament = store.tournaments.find(t => t.id === tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found' };

  // Only confirmed registrations are eligible
  const eligibleRegs = store.registrations.filter(
    r => r.tournament_id === tournamentId && r.status === 'confirmed'
  );

  if (eligibleRegs.length < 2) {
    return { success: false, error: 'At least 2 confirmed participants are required to generate fixtures' };
  }

  // Clear existing scheduled matches for this tournament
  store.matches = store.matches.filter(m => m.tournament_id !== tournamentId || m.status === 'completed');

  const generatedMatches: Match[] = [];
  const count = eligibleRegs.length;

  // Pair up participants
  let matchNumber = 1;
  for (let i = 0; i < count; i += 2) {
    const regA = eligibleRegs[i];
    const regB = i + 1 < count ? eligibleRegs[i + 1] : null;

    const participants: MatchParticipant[] = [
      {
        id: `mp-${Date.now()}-${matchNumber}-1`,
        match_id: `match-${tournamentId}-r1-m${matchNumber}`,
        registration_id: regA.id,
        participant_slot: 1,
        kills: 0,
        points: 0,
        is_winner: false,
        registration: regA,
      },
    ];

    if (regB) {
      participants.push({
        id: `mp-${Date.now()}-${matchNumber}-2`,
        match_id: `match-${tournamentId}-r1-m${matchNumber}`,
        registration_id: regB.id,
        participant_slot: 2,
        kills: 0,
        points: 0,
        is_winner: false,
        registration: regB,
      });
    }

    const match: Match = {
      id: `match-${tournamentId}-r1-m${matchNumber}`,
      tournament_id: tournamentId,
      round_number: 1,
      round_label: count <= 4 ? 'Semi-Finals' : count <= 8 ? 'Quarter-Finals' : 'Round of 16',
      match_number: matchNumber,
      format: 'Single Elimination',
      scheduled_time: new Date(new Date(tournament.start_time).getTime() + (matchNumber - 1) * 1800000).toISOString(),
      status: 'scheduled',
      room_id: tournament.room_id || 'ROOM-PENDING',
      room_password: tournament.room_password || 'PASS-PENDING',
      room_released: tournament.room_released || false,
      participants,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    generatedMatches.push(match);
    store.matches.push(match);
    matchNumber++;
  }

  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'FIXTURES_GENERATED',
    targetEntity: 'tournaments',
    targetId: tournamentId,
    metadata: { format: 'Single Elimination', total_matches: generatedMatches.length },
  });

  return { success: true, matches: generatedMatches };
}

/**
 * Battle Royale Custom Lobby Fixture Generator
 */
export async function generateBattleRoyaleLobby(
  tournamentId: string,
  matchLabel: string = 'Match 1 - Erangel',
  adminId: string
): Promise<{ success: boolean; match?: Match; error?: string }> {
  const store = getStore();
  const tournament = store.tournaments.find(t => t.id === tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found' };

  const eligibleRegs = store.registrations.filter(
    r => r.tournament_id === tournamentId && r.status === 'confirmed'
  );

  if (eligibleRegs.length === 0) {
    return { success: false, error: 'No confirmed registrations available for lobby' };
  }

  const matchId = `match-br-${tournamentId}-${Date.now()}`;
  const participants: MatchParticipant[] = eligibleRegs.map((reg, idx) => ({
    id: `mp-${Date.now()}-${idx + 1}`,
    match_id: matchId,
    registration_id: reg.id,
    participant_slot: idx + 1,
    kills: 0,
    points: 0,
    is_winner: false,
    registration: reg,
  }));

  const match: Match = {
    id: matchId,
    tournament_id: tournamentId,
    round_number: 1,
    round_label: matchLabel,
    match_number: 1,
    format: 'Battle Royale',
    scheduled_time: tournament.start_time,
    status: 'scheduled',
    room_id: tournament.room_id || 'BR-LOBBY-8921',
    room_password: tournament.room_password || 'VYROX_BR',
    room_released: tournament.room_released || false,
    participants,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.matches.push(match);
  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'LOBBY_GENERATED',
    targetEntity: 'matches',
    targetId: matchId,
    metadata: { tournament_id: tournamentId, participants_count: participants.length },
  });

  return { success: true, match };
}

/**
 * Create Custom Match on Organizer Terms
 * Allows setting exact round title, map, teams, room credentials
 */
export async function createCustomMatch(params: {
  tournamentId: string;
  roundLabel: string;
  format?: string;
  scheduledTime: string;
  roomId?: string;
  roomPassword?: string;
  participantRegistrationIds?: string[];
  adminId: string;
}): Promise<{ success: boolean; match?: Match; error?: string }> {
  const store = getStore();
  const tournament = store.tournaments.find(t => t.id === params.tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found' };

  const matchId = `match-custom-${Date.now()}`;
  
  // Choose eligible or specified teams
  const eligibleRegs = store.registrations.filter(
    r => r.tournament_id === params.tournamentId && r.status === 'confirmed'
  );
  const targetRegs = params.participantRegistrationIds && params.participantRegistrationIds.length > 0
    ? eligibleRegs.filter(r => params.participantRegistrationIds!.includes(r.id))
    : eligibleRegs;

  const participants: MatchParticipant[] = targetRegs.map((reg, idx) => ({
    id: `mp-c-${Date.now()}-${idx + 1}`,
    match_id: matchId,
    registration_id: reg.id,
    participant_slot: idx + 1,
    kills: 0,
    points: 0,
    is_winner: false,
    registration: reg,
  }));

  const match: Match = {
    id: matchId,
    tournament_id: params.tournamentId,
    round_number: store.matches.filter(m => m.tournament_id === params.tournamentId).length + 1,
    round_label: params.roundLabel,
    match_number: 1,
    format: params.format || tournament.tournament_format,
    scheduled_time: params.scheduledTime || tournament.start_time,
    status: 'scheduled',
    room_id: params.roomId || tournament.room_id || '987123',
    room_password: params.roomPassword || tournament.room_password || 'VYROX99',
    room_released: Boolean(params.roomId && params.roomPassword) || tournament.room_released,
    participants,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.matches.push(match);
  persistStore(store);

  await logAdminAction({
    actorId: params.adminId,
    action: 'CUSTOM_MATCH_CREATED',
    targetEntity: 'matches',
    targetId: matchId,
    metadata: { label: params.roundLabel, participants: participants.length },
  });

  return { success: true, match };
}

/**
 * Release or update Room Credentials for a specific match
 */
export async function releaseMatchRoomCredentials(
  matchId: string,
  roomId: string,
  roomPassword: string,
  adminId: string
): Promise<{ success: boolean; match?: Match; error?: string }> {
  const store = getStore();
  const match = store.matches.find(m => m.id === matchId);
  if (!match) return { success: false, error: 'Match not found' };

  match.room_id = roomId;
  match.room_password = roomPassword;
  match.room_released = true;
  match.updated_at = new Date().toISOString();

  // Also sync to tournament default if not set
  const tourney = store.tournaments.find(t => t.id === match.tournament_id);
  if (tourney && !tourney.room_id) {
    tourney.room_id = roomId;
    tourney.room_password = roomPassword;
    tourney.room_released = true;
  }

  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'MATCH_ROOM_RELEASED',
    targetEntity: 'matches',
    targetId: matchId,
    metadata: { round: match.round_label, roomId },
  });

  return { success: true, match };
}

/**
 * Record and Finalize Match Results
 * Calculates placements, kills, points, ratings, and statistics atomically
 */
export async function recordMatchResults(
  matchId: string,
  results: ParticipantResultInput[],
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  const store = getStore();
  const match = store.matches.find(m => m.id === matchId);
  if (!match) return { success: false, error: 'Match not found' };

  const tournament = store.tournaments.find(t => t.id === match.tournament_id);

  // Update participants
  results.forEach(res => {
    const p = match.participants?.find(part => part.registration_id === res.registrationId);
    if (p) {
      p.placement = res.placement;
      p.kills = res.kills;
      p.points = res.points;
      p.is_winner = res.isWinner;

      // Find player / captain
      const reg = store.registrations.find(r => r.id === res.registrationId);
      if (reg) {
        const captain = store.profiles.find(prof => prof.id === reg.captain_id);
        if (captain) {
          // Update profile stats
          captain.total_kills += res.kills;
          if (res.isWinner) {
            captain.total_wins += 1;
          }

          // Rating update with idempotency key
          const idempotencyKey = `rating-${match.id}-${captain.id}`;
          let delta = 0;

          if (match.format === 'Single Elimination' || match.format === '1v1') {
            // Find opponent rating if 1v1
            const oppPart = match.participants?.find(part => part.registration_id !== res.registrationId);
            const oppReg = oppPart ? store.registrations.find(r => r.id === oppPart.registration_id) : null;
            const oppProfile = oppReg ? store.profiles.find(pr => pr.id === oppReg.captain_id) : null;
            const oppRating = oppProfile ? oppProfile.current_rating : 1000;

            delta = calculate1v1Elo(captain.current_rating, oppRating, res.isWinner);
          } else {
            // Battle Royale
            delta = calculateBattleRoyaleRatingDelta(res.placement || 25, res.kills);
          }

          applyRatingEvent({
            playerId: captain.id,
            tournamentId: match.tournament_id,
            matchId: match.id,
            delta,
            description: `${tournament?.title || 'Tournament'} - ${match.round_label} (${res.isWinner ? 'Victory' : `Rank #${res.placement || 'N/A'}`}, ${res.kills} kills)`,
            idempotencyKey,
          });
        }
      }
    }
  });

  match.status = 'completed';
  match.completed_at = new Date().toISOString();
  match.updated_at = new Date().toISOString();
  persistStore(store);

  await logAdminAction({
    actorId: adminId,
    action: 'RESULT_FINALIZED',
    targetEntity: 'matches',
    targetId: matchId,
    metadata: {
      tournament_id: match.tournament_id,
      match_label: match.round_label,
      results_count: results.length,
    },
  });

  return { success: true };
}
