import { Match, MatchParticipant, Registration } from '../supabase/types';
import { getStore, persistStore } from './store';
import { logAdminAction } from './audit-service';
import { calculate1v1Elo, calculateBattleRoyaleRatingDelta, applyRatingEvent, rebuildLocalPlayerRankings } from './rating-service';
import { createClient } from '../supabase/client';
import { isSupabaseConfigured } from './store';
import { getAllRegistrations, getUserRegistrations } from './registration-service';
import { getTournamentById } from './tournament-service';

export interface ParticipantResultInput {
  registrationId: string;
  placement?: number;
  kills: number;
  points: number;
  isWinner: boolean;
  memberKills?: Record<string, string>;
}

function eliminationRoundLabel(participantCount: number) {
  if (participantCount <= 2) return 'Final';
  if (participantCount <= 4) return 'Semi-Finals';
  if (participantCount <= 8) return 'Quarter-Finals';
  const bracketSize = 2 ** Math.ceil(Math.log2(participantCount));
  return `Round of ${bracketSize}`;
}

const MATCH_FIELDS = 'id,tournament_id,round_number,round_label,match_number,format,scheduled_time,status,room_released,created_by,completed_at,created_at,updated_at';

function nextBattleRoyaleMatchNumber(matches: Match[]): number {
  // Include the row count so older tournaments with duplicate #1 rows still
  // receive a fresh number even before migration 006 has been applied.
  return Math.max(matches.length, 0, ...matches.map((match) => match.match_number || 0)) + 1;
}

function labelWithMatchNumber(label: string, matchNumber: number): string {
  return label.replace(/^Match\s*\d+/i, `Match ${matchNumber}`);
}

async function loadDatabaseMatches(tournamentId?: string, matchIds?: string[], includeAllParticipants = false): Promise<Match[]> {
  const supabase = createClient();
  let query = supabase.from('matches').select(MATCH_FIELDS).order('scheduled_time');
  if (tournamentId) query = query.eq('tournament_id', tournamentId);
  if (matchIds) query = query.in('id', matchIds);
  const { data, error } = await query;
  if (error) throw error;
  const matches = (data || []) as Match[];
  if (!matches.length) return [];
  const { data: participantRows, error: participantError } = await supabase.from('match_participants').select('*').in('match_id', matches.map((match) => match.id));
  if (participantError) throw participantError;
  const registrations = includeAllParticipants ? await getAllRegistrations() : [];
  const registrationMap = new Map(registrations.map((registration) => [registration.id, registration]));
  const participants = (participantRows || []).map((participant) => ({ ...participant, registration: registrationMap.get(participant.registration_id) }));
  const session = await supabase.auth.getSession();
  const withCredentials = await Promise.all(matches.map(async (match) => {
    type RoomCredentials = { room_id?: string | null; room_password?: string | null };
    let credentials: RoomCredentials | null = null;
    if (session.data.session) {
      const result = await supabase.rpc('get_match_room_credentials', { p_match_id: match.id });
      if (!result.error) credentials = result.data as RoomCredentials | null;
    }
    return {
      ...match,
      room_id: credentials?.room_id || null,
      room_password: credentials?.room_password || null,
      participants: participants.filter((participant) => participant.match_id === match.id),
    };
  }));
  return withCredentials;
}

export async function getMatchesByTournament(tournamentId: string, includeAllParticipants = false): Promise<Match[]> {
  if (isSupabaseConfigured()) return loadDatabaseMatches(tournamentId, undefined, includeAllParticipants);
  const store = getStore();
  const matches = store.matches.filter(m => m.tournament_id === tournamentId);

  return matches.map(m => ({
    ...m,
    participants: (m.participants || []).map(p => ({
      ...p,
      registration: includeAllParticipants ? store.registrations.find(r => r.id === p.registration_id) : undefined,
    })),
  }));
}

export async function deleteArchivedMatch(matchId: string, adminId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('admin_delete_archived_match', { p_match_id: matchId });
    if (error) throw error;
    const result = data as { success?: boolean; error?: string } | null;
    if (!result?.success) throw new Error(result?.error || 'Could not delete this match. Apply migration 009 and try again.');
    return;
  }

  const store = getStore();
  const match = store.matches.find((item) => item.id === matchId);
  const tournament = match && store.tournaments.find((item) => item.id === match.tournament_id);
  if (!match || !tournament) throw new Error('Match not found.');
  if (tournament.status !== 'completed' && tournament.status !== 'cancelled') {
    throw new Error('Only matches from completed or cancelled events can be deleted.');
  }
  store.matches = store.matches.filter((item) => item.id !== matchId);
  store.ratingEvents = store.ratingEvents.filter((event) => event.match_id !== matchId);
  persistStore(store);
  rebuildLocalPlayerRankings();
  await logAdminAction({ actorId: adminId, action: 'ARCHIVED_MATCH_DELETED', targetEntity: 'matches', targetId: matchId, metadata: { tournament_id: tournament.id, match_number: match.match_number, round_label: match.round_label } });
}

export async function getUserMatches(userId: string): Promise<Match[]> {
  if (isSupabaseConfigured()) {
    const registrations = await getUserRegistrations(userId);
    const ids = registrations.filter((registration) => registration.captain_id === userId).map((registration) => registration.id);
    if (!ids.length) return [];
    const { data, error } = await createClient().from('match_participants').select('match_id').in('registration_id', ids);
    if (error) throw error;
    return loadDatabaseMatches(undefined, [...new Set((data || []).map((row) => row.match_id))]);
  }
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
  if (isSupabaseConfigured()) {
    const tournament = await getTournamentById(tournamentId);
    if (!tournament) return { success: false, error: 'Tournament not found' };
    if (tournament.tournament_format !== 'Single Elimination') return { success: false, error: 'This event is not set up as a knockout tournament.' };
    const registrations = (await getAllRegistrations()).filter((registration) => registration.tournament_id === tournamentId && registration.status === 'confirmed');
    if (registrations.length < 2) return { success: false, error: 'At least 2 confirmed participants are required to generate fixtures' };
    const existingMatches = await getMatchesByTournament(tournamentId);
    if (existingMatches.length > 0) return { success: false, error: 'Fixtures already exist. Use “Create next knockout round” after scoring the current round.' };
    const supabase = createClient();
    const labels = eliminationRoundLabel(registrations.length);
    const ids: string[] = [];
    for (let index = 0, matchNumber = 1; index < registrations.length; index += 2, matchNumber += 1) {
      const participants = [registrations[index].id];
      if (registrations[index + 1]) participants.push(registrations[index + 1].id);
      const { data: matchId, error } = await supabase.rpc('create_match_with_participants', {
        p_tournament_id: tournamentId, p_round_number: 1, p_round_label: labels,
        p_match_number: matchNumber, p_format: 'Single Elimination',
        p_scheduled_time: new Date(new Date(tournament.start_time).getTime() + (matchNumber - 1) * 1800000).toISOString(),
        p_registration_ids: participants,
      });
      if (error) return { success: false, error: error.message };
      ids.push(matchId as string);
    }
    await logAdminAction({ actorId: adminId, action: 'FIXTURES_GENERATED', targetEntity: 'tournaments', targetId: tournamentId, metadata: { format: 'Single Elimination', total_matches: ids.length } });
    return { success: true, matches: await loadDatabaseMatches(tournamentId, ids, true) };
  }
  const store = getStore();
  const tournament = store.tournaments.find(t => t.id === tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found' };
  if (tournament.tournament_format !== 'Single Elimination') return { success: false, error: 'This event is not set up as a knockout tournament.' };

  // Only confirmed registrations are eligible
  const eligibleRegs = store.registrations.filter(
    r => r.tournament_id === tournamentId && r.status === 'confirmed'
  );

  if (eligibleRegs.length < 2) {
    return { success: false, error: 'At least 2 confirmed participants are required to generate fixtures' };
  }
  if (store.matches.some((match) => match.tournament_id === tournamentId)) {
    return { success: false, error: 'Fixtures already exist. Use “Create next knockout round” after scoring the current round.' };
  }

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
      round_label: eliminationRoundLabel(count),
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

/** Create the next knockout round from the winners of the latest completed round. */
export async function advanceSingleEliminationRound(
  tournamentId: string,
  adminId: string
): Promise<{ success: boolean; matches?: Match[]; tournamentComplete?: boolean; error?: string }> {
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found.' };
  if (tournament.tournament_format !== 'Single Elimination') {
    return { success: false, error: 'Next-round generation is only for Single Elimination tournaments.' };
  }

  const matches = await getMatchesByTournament(tournamentId, true);
  if (matches.length === 0) return { success: false, error: 'Create the first knockout round before advancing.' };
  const latestRoundNumber = Math.max(...matches.map((match) => match.round_number));
  const latestRound = matches
    .filter((match) => match.round_number === latestRoundNumber)
    .sort((a, b) => a.match_number - b.match_number);
  if (latestRound.some((match) => match.status !== 'completed')) {
    return { success: false, error: 'Score and finalize every match in the current round first.' };
  }

  const winners: MatchParticipant[] = [];
  for (const match of latestRound) {
    const matchWinners = (match.participants || []).filter((participant) => participant.is_winner);
    if (matchWinners.length !== 1) {
      return { success: false, error: `Choose exactly one winner for ${match.round_label}, Match ${match.match_number}.` };
    }
    winners.push(matchWinners[0]);
  }
  if (winners.length <= 1) return { success: true, matches: [], tournamentComplete: true };

  const nextRoundNumber = latestRoundNumber + 1;
  const nextLabel = eliminationRoundLabel(winners.length);
  const lastScheduledTime = Math.max(...latestRound.map((match) => new Date(match.scheduled_time).getTime()));
  const firstScheduledTime = Math.max(lastScheduledTime + 30 * 60_000, Date.now() + 30 * 60_000);
  const nextMatches: Match[] = [];

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    for (let index = 0, matchNumber = 1; index < winners.length; index += 2, matchNumber += 1) {
      const registrationIds = [winners[index].registration_id];
      if (winners[index + 1]) registrationIds.push(winners[index + 1].registration_id);
      const { data: matchId, error } = await supabase.rpc('create_match_with_participants', {
        p_tournament_id: tournamentId,
        p_round_number: nextRoundNumber,
        p_round_label: nextLabel,
        p_match_number: matchNumber,
        p_format: 'Single Elimination',
        p_scheduled_time: new Date(firstScheduledTime + (matchNumber - 1) * 30 * 60_000).toISOString(),
        p_registration_ids: registrationIds,
        p_room_id: null,
        p_room_password: null,
        p_room_released: false,
      });
      if (error) return { success: false, error: error.message };
      const created = await loadDatabaseMatches(tournamentId, [String(matchId)], true);
      if (created[0]) nextMatches.push(created[0]);
    }
  } else {
    const store = getStore();
    for (let index = 0, matchNumber = 1; index < winners.length; index += 2, matchNumber += 1) {
      const matchId = `match-${tournamentId}-r${nextRoundNumber}-m${matchNumber}`;
      const registrationIds = [winners[index].registration_id];
      if (winners[index + 1]) registrationIds.push(winners[index + 1].registration_id);
      const participants = registrationIds.map((registrationId, participantIndex) => {
        const registration = store.registrations.find((item) => item.id === registrationId);
        return {
          id: `${matchId}-p${participantIndex + 1}`,
          match_id: matchId,
          registration_id: registrationId,
          participant_slot: participantIndex + 1,
          kills: 0,
          points: 0,
          is_winner: false,
          registration,
        } as MatchParticipant;
      });
      const match: Match = {
        id: matchId,
        tournament_id: tournamentId,
        round_number: nextRoundNumber,
        round_label: nextLabel,
        match_number: matchNumber,
        format: 'Single Elimination',
        scheduled_time: new Date(firstScheduledTime + (matchNumber - 1) * 30 * 60_000).toISOString(),
        status: 'scheduled',
        room_released: false,
        participants,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.matches.push(match);
      nextMatches.push(match);
    }
    persistStore(store);
  }

  await logAdminAction({
    actorId: adminId,
    action: 'KNOCKOUT_ROUND_ADVANCED',
    targetEntity: 'tournaments',
    targetId: tournamentId,
    metadata: { round_number: nextRoundNumber, matches_created: nextMatches.length },
  });
  return { success: true, matches: nextMatches };
}

/**
 * Battle Royale Custom Lobby Fixture Generator
 */
export async function generateBattleRoyaleLobby(
  tournamentId: string,
  matchLabel: string = 'Match 1 - Erangel',
  adminId: string
): Promise<{ success: boolean; match?: Match; error?: string }> {
  if (isSupabaseConfigured()) {
    const tournament = await getTournamentById(tournamentId);
    if (!tournament) return { success: false, error: 'Tournament not found' };
    if (tournament.tournament_format !== 'Battle Royale') return { success: false, error: 'This event is not set up for Battle Royale lobbies.' };
    if ((await getMatchesByTournament(tournamentId)).length > 0) return { success: false, error: 'The first lobby already exists. Use “Add another Battle Royale lobby”.' };
    const registrations = (await getAllRegistrations()).filter((registration) => registration.tournament_id === tournamentId && registration.status === 'confirmed');
    if (!registrations.length) return { success: false, error: 'No confirmed registrations available for lobby' };
    const { data: matchId, error } = await createClient().rpc('create_match_with_participants', {
      p_tournament_id: tournamentId, p_round_number: 1, p_round_label: matchLabel,
      p_match_number: 1, p_format: 'Battle Royale', p_scheduled_time: tournament.start_time,
      p_registration_ids: registrations.map((registration) => registration.id),
      p_room_id: null, p_room_password: null, p_room_released: false,
    });
    if (error) return { success: false, error: error.message };
    await logAdminAction({ actorId: adminId, action: 'LOBBY_GENERATED', targetEntity: 'matches', targetId: String(matchId), metadata: { tournament_id: tournamentId, participants_count: registrations.length } });
    return { success: true, match: (await loadDatabaseMatches(tournamentId, [String(matchId)], true))[0] };
  }
  const store = getStore();
  const tournament = store.tournaments.find(t => t.id === tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found' };
  if (tournament.tournament_format !== 'Battle Royale') return { success: false, error: 'This event is not set up for Battle Royale lobbies.' };
  if (store.matches.some((match) => match.tournament_id === tournamentId)) return { success: false, error: 'The first lobby already exists. Add another lobby from the organizer page.' };

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
    room_id: tournament.room_id || null,
    room_password: tournament.room_password || null,
    room_released: Boolean(tournament.room_released && tournament.room_id && tournament.room_password),
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
  if (isSupabaseConfigured()) {
    const registrations = (await getAllRegistrations()).filter((registration) => registration.tournament_id === params.tournamentId && registration.status === 'confirmed');
    const targetRegistrations = params.participantRegistrationIds?.length
      ? registrations.filter((registration) => params.participantRegistrationIds!.includes(registration.id))
      : registrations;
    const existing = await getMatchesByTournament(params.tournamentId);
    const tournament = await getTournamentById(params.tournamentId);
    if (!tournament) return { success: false, error: 'Tournament not found' };
    if (tournament.tournament_format !== 'Battle Royale') return { success: false, error: 'Custom lobbies can only be added to Battle Royale tournaments.' };
    if (!targetRegistrations.length) return { success: false, error: 'Approve at least one entry before creating a lobby.' };
    const matchNumber = nextBattleRoyaleMatchNumber(existing);
    const roundLabel = labelWithMatchNumber(params.roundLabel, matchNumber);
    const { data: matchId, error } = await createClient().rpc('create_match_with_participants', {
      p_tournament_id: params.tournamentId, p_round_number: matchNumber,
      p_round_label: roundLabel, p_match_number: matchNumber,
      p_format: params.format || tournament.tournament_format,
      p_scheduled_time: params.scheduledTime || tournament.start_time,
      p_registration_ids: targetRegistrations.map((registration) => registration.id),
      p_room_id: params.roomId || null, p_room_password: params.roomPassword || null,
      p_room_released: Boolean(params.roomId && params.roomPassword),
    });
    if (error) return { success: false, error: error.message };
    await logAdminAction({ actorId: params.adminId, action: 'CUSTOM_MATCH_CREATED', targetEntity: 'matches', targetId: String(matchId), metadata: { label: roundLabel, match_number: matchNumber, participants: targetRegistrations.length } });
    return { success: true, match: (await loadDatabaseMatches(params.tournamentId, [String(matchId)], true))[0] };
  }
  const store = getStore();
  const tournament = store.tournaments.find(t => t.id === params.tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found' };
  if (tournament.tournament_format !== 'Battle Royale') return { success: false, error: 'Custom lobbies can only be added to Battle Royale tournaments.' };

  const existingMatches = store.matches.filter((match) => match.tournament_id === params.tournamentId);
  const matchNumber = nextBattleRoyaleMatchNumber(existingMatches);
  const roundLabel = labelWithMatchNumber(params.roundLabel, matchNumber);

  const matchId = `match-custom-${Date.now()}`;
  
  // Choose eligible or specified teams
  const eligibleRegs = store.registrations.filter(
    r => r.tournament_id === params.tournamentId && r.status === 'confirmed'
  );
  const targetRegs = params.participantRegistrationIds && params.participantRegistrationIds.length > 0
    ? eligibleRegs.filter(r => params.participantRegistrationIds!.includes(r.id))
    : eligibleRegs;
  if (!targetRegs.length) return { success: false, error: 'Approve at least one entry before creating a lobby.' };

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
    round_number: matchNumber,
    round_label: roundLabel,
    match_number: matchNumber,
    format: params.format || tournament.tournament_format,
    scheduled_time: params.scheduledTime || tournament.start_time,
    status: 'scheduled',
    room_id: params.roomId || tournament.room_id || null,
    room_password: params.roomPassword || tournament.room_password || null,
    room_released: Boolean(params.roomId && params.roomPassword) || Boolean(tournament.room_released && tournament.room_id && tournament.room_password),
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
    metadata: { label: roundLabel, match_number: matchNumber, participants: participants.length },
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
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().from('matches').update({ room_id: roomId, room_password: roomPassword, room_released: true, updated_at: new Date().toISOString() }).eq('id', matchId).select('id,tournament_id,round_label').maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Match not found' };
    await logAdminAction({ actorId: adminId, action: 'MATCH_ROOM_RELEASED', targetEntity: 'matches', targetId: matchId, metadata: { round: data.round_label } });
    return { success: true, match: (await loadDatabaseMatches(data.tournament_id, [matchId], true))[0] };
  }
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
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('finalize_match_results', {
      p_match_id: matchId,
      p_results: results.map((result) => ({
        registrationId: result.registrationId, placement: result.placement,
        kills: result.kills, points: result.points, isWinner: result.isWinner,
        ...(Object.values(result.memberKills || {}).some((value) => value.trim() !== '')
          ? { memberKills: Object.fromEntries(Object.entries(result.memberKills || {}).filter(([, value]) => value.trim() !== '').map(([uid, value]) => [uid, Number(value)])) }
          : {}),
      })),
    });
    if (error) return { success: false, error: error.message };
    return data?.success ? { success: true } : { success: false, error: data?.error || 'Could not finalize match results.' };
  }
  const store = getStore();
  const match = store.matches.find(m => m.id === matchId);
  if (!match) return { success: false, error: 'Match not found' };
  if (match.status === 'completed') return { success: false, error: 'Results have already been finalized for this match.' };
  if (results.length !== (match.participants || []).length || results.length === 0) return { success: false, error: 'Enter a result for every participant before finalizing.' };
  if (results.some((result) => !match.participants?.some((participant) => participant.registration_id === result.registrationId))) {
    return { success: false, error: 'One or more results do not belong to this match.' };
  }

  const tournament = store.tournaments.find(t => t.id === match.tournament_id);
  if (!tournament) return { success: false, error: 'Tournament not found.' };
  if (tournament.status === 'cancelled') return { success: false, error: 'Cancelled events cannot publish results or prizes.' };
  const invalidIndividualKills = results.some((result) => {
    const values = Object.values(result.memberKills || {}).filter((value) => value.trim() !== '');
    if (!values.length) return false;
    const registration = store.registrations.find((row) => row.id === result.registrationId);
    const roster = registration?.members || [];
    return roster.length !== tournament.team_size || roster.some((member) => {
      const value = result.memberKills?.[member.uid];
      return value === undefined || value.trim() === '' || !/^\d+$/.test(value);
    }) || roster.reduce((sum, member) => sum + Number(result.memberKills?.[member.uid]), 0) !== result.kills;
  });
  if (invalidIndividualKills) return { success: false, error: 'Individual kills must include every roster member and add up to the squad kill total.' };
  const ratingSnapshot = new Map(store.profiles.map((profile) => [profile.id, profile.current_rating]));

  // Update participants
  results.forEach(res => {
    const p = match.participants?.find(part => part.registration_id === res.registrationId);
    if (p) {
      p.placement = res.placement;
      p.kills = res.kills;
      p.points = res.points;
      p.is_winner = res.isWinner;

      // Apply the team's placement result to the captain and every roster member
      // whose in-game ID is linked to a VYROX profile.
      const reg = store.registrations.find(r => r.id === res.registrationId);
      if (reg) {
        let teamRatingDelta = calculateBattleRoyaleRatingDelta(res.placement || 25, res.kills);
        if (match.format.toLowerCase().includes('elimination') || match.format.toLowerCase().includes('1v1')) {
          const opponentParticipant = match.participants?.find((part) => part.registration_id !== res.registrationId);
          const opponentRegistration = opponentParticipant ? store.registrations.find((row) => row.id === opponentParticipant.registration_id) : null;
          teamRatingDelta = calculate1v1Elo(ratingSnapshot.get(reg.captain_id) || 1000,
            ratingSnapshot.get(opponentRegistration?.captain_id || '') || 1000, res.isWinner);
        }
        const playerIds = new Set<string>([reg.captain_id]);
        for (const member of reg.members || []) {
          const linkedProfile = member.player_id
            ? store.profiles.find((profile) => profile.id === member.player_id)
            : store.profiles.find((profile) => tournament.game === 'BGMI'
              ? profile.bgmi_uid === member.uid
              : profile.free_fire_uid === member.uid);
          if (linkedProfile) playerIds.add(linkedProfile.id);
        }

        for (const playerId of playerIds) {
          const profile = store.profiles.find((row) => row.id === playerId);
          if (!profile) continue;
          const eventKey = `rating-${match.id}-${playerId}`;
          if (store.ratingEvents.some((event) => event.idempotency_key === eventKey)) continue;
          const alreadyPlayed = store.ratingEvents.some((event) => event.player_id === playerId && event.tournament_id === tournament.id);
          if (!alreadyPlayed) profile.total_tournaments += 1;
          if (res.isWinner) profile.total_wins += 1;
          const member = (reg.members || []).find((row) => row.player_id === playerId ||
            (tournament.game === 'BGMI' ? profile.bgmi_uid === row.uid : profile.free_fire_uid === row.uid));
          const hasIndividualKills = Object.values(res.memberKills || {}).some((value) => value.trim() !== '');
          const individualKills = tournament.team_size === 1
            ? res.kills
            : (member && hasIndividualKills ? Number(res.memberKills?.[member.uid] || 0) : 0);
          profile.total_kills += individualKills;

          let delta: number;
          if (match.format.toLowerCase().includes('elimination') || match.format.toLowerCase().includes('1v1')) {
            const opponentParticipant = match.participants?.find((part) => part.registration_id !== res.registrationId);
            const opponentRegistration = opponentParticipant ? store.registrations.find((row) => row.id === opponentParticipant.registration_id) : null;
            delta = calculate1v1Elo(profile.current_rating, ratingSnapshot.get(opponentRegistration?.captain_id || '') || 1000, res.isWinner);
          } else {
            delta = calculateBattleRoyaleRatingDelta(res.placement || 25, tournament.team_size === 1 ? res.kills : individualKills);
          }
          applyRatingEvent({
            playerId,
            tournamentId: tournament.id,
            matchId: match.id,
            delta,
            description: `${tournament.title} - ${match.round_label} (${res.isWinner ? 'Victory' : `Rank #${res.placement || 'N/A'}`})`,
            idempotencyKey: eventKey,
          });
        }
        p.stats = {
          ...(p.stats || {}),
          team_rating_change: teamRatingDelta,
          ...(Object.values(res.memberKills || {}).some((value) => value.trim() !== '')
            ? { member_kills: Object.fromEntries(Object.entries(res.memberKills || {}).map(([uid, value]) => [uid, Number(value)])) }
            : {}),
        };
      }
    }
  });

  match.status = 'completed';
  match.completed_at = new Date().toISOString();
  match.updated_at = new Date().toISOString();

  const explicitFinal = /(^|[^a-z])final([^a-z]|$)/i.test(match.round_label)
    && !/(semi|quarter)[- ]?final/i.test(match.round_label);
  const noPendingMatches = !store.matches.some((candidate) => candidate.tournament_id === tournament.id
    && candidate.id !== match.id && (candidate.status === 'scheduled' || candidate.status === 'live'));
  const isFinalMatch = explicitFinal || (tournament.tournament_format !== 'Single Elimination' && noPendingMatches);
  if (isFinalMatch) {
    tournament.status = 'completed';
    tournament.updated_at = new Date().toISOString();
    store.prizeAwards ||= [];
    for (const result of results) {
      const distribution = (tournament.prize_distribution || []).find((item) => {
        const placeNumber = Number(item.place.match(/\d+/)?.[0]) || (/winner|champion/i.test(item.place) ? 1 : 0);
        return placeNumber === result.placement;
      });
      const amountPaise = Math.round((distribution?.amount || 0) * 100);
      if (amountPaise <= 0 || store.prizeAwards.some((award) => award.tournament_id === tournament.id && award.registration_id === result.registrationId)) continue;
      const registration = store.registrations.find((row) => row.id === result.registrationId);
      if (!registration) continue;
      store.prizeAwards.push({
        id: `award-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tournament_id: tournament.id,
        registration_id: registration.id,
        player_id: registration.captain_id,
        place: result.placement || 1,
        amount_paise: amountPaise,
        status: 'pending',
        created_at: new Date().toISOString(),
        tournament: { id: tournament.id, title: tournament.title, slug: tournament.slug },
        registration: { id: registration.id, captain_id: registration.captain_id, team_name: registration.team_name },
      });
    }
  }
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
