import { RatingEvent } from '../supabase/types';
import { getStore, persistStore } from './store';

/**
 * 1v1 / Head-to-Head Elo Calculator
 * Uses standard competitive chess / esports Elo algorithm with K-factor = 32
 */
export function calculate1v1Elo(playerRating: number, opponentRating: number, playerWon: boolean): number {
  const K = 32;
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const actualScore = playerWon ? 1 : 0;
  return Math.round(K * (actualScore - expectedScore));
}

/**
 * Battle Royale Performance-Weighted Rating Adjustment
 * Combines placement tier weighting with individual kill impact
 */
export function calculateBattleRoyaleRatingDelta(placement: number, kills: number, totalTeams: number = 25): number {
  let placementDelta = 0;
  
  if (placement === 1) {
    placementDelta = 35; // Winner Chicken Dinner
  } else if (placement === 2) {
    placementDelta = 24;
  } else if (placement === 3) {
    placementDelta = 18;
  } else if (placement <= 5) {
    placementDelta = 12;
  } else if (placement <= 10) {
    placementDelta = 6;
  } else if (placement <= 15) {
    placementDelta = -2;
  } else if (placement <= 20) {
    placementDelta = -8;
  } else {
    placementDelta = -14;
  }

  // Each verified kill awards +3 rating points
  const killDelta = kills * 3;
  
  return placementDelta + killDelta;
}

/**
 * Idempotent rating application.
 * Prevents double-counting if a request or webhook is retried.
 */
export function applyRatingEvent(params: {
  playerId: string;
  tournamentId?: string;
  matchId?: string;
  delta: number;
  description: string;
  idempotencyKey: string;
}): RatingEvent | null {
  const store = getStore();

  // 1. Idempotency Check: Don't re-apply if key exists
  const existingEvent = store.ratingEvents.find(e => e.idempotency_key === params.idempotencyKey);
  if (existingEvent) {
    return existingEvent;
  }

  // 2. Find player profile
  const profile = store.profiles.find(p => p.id === params.playerId);
  if (!profile) {
    return null;
  }

  const prevRating = profile.current_rating;
  // Floor rating at 500 so players don't go negative
  const newRating = Math.max(500, prevRating + params.delta);

  const event: RatingEvent = {
    id: `re-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    player_id: params.playerId,
    tournament_id: params.tournamentId,
    match_id: params.matchId,
    previous_rating: prevRating,
    rating_change: params.delta,
    new_rating: newRating,
    description: params.description,
    idempotency_key: params.idempotencyKey,
    created_at: new Date().toISOString(),
  };

  store.ratingEvents.push(event);
  profile.current_rating = newRating;
  profile.highest_rating = Math.max(profile.highest_rating ?? 1000, newRating);
  profile.updated_at = new Date().toISOString();
  persistStore(store);

  return event;
}

export function rebuildLocalPlayerRankings() {
  const store = getStore();
  const activeTournaments = new Map(store.tournaments.map((tournament) => [tournament.id, tournament]));
  for (const profile of store.profiles) {
    let rating = 1000;
    let peak = 1000;
    const events = store.ratingEvents.filter((event) => event.player_id === profile.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const event of events) {
      rating = Math.max(500, rating + event.rating_change);
      peak = Math.max(peak, rating);
    }
    const playedTournamentIds = new Set<string>();
    let wins = 0;
    let kills = 0;
    for (const match of store.matches.filter((row) => row.status === 'completed')) {
      const tournament = activeTournaments.get(match.tournament_id);
      if (!tournament || tournament.status === 'cancelled') continue;
      for (const participant of match.participants || []) {
        const registration = store.registrations.find((row) => row.id === participant.registration_id);
        if (!registration) continue;
        const matchingRosterMember = registration.members?.find((member) => member.player_id === profile.id ||
          (tournament.game === 'BGMI' && member.uid === profile.bgmi_uid) ||
          (tournament.game === 'Free Fire' && member.uid === profile.free_fire_uid));
        const isMember = registration.captain_id === profile.id || Boolean(matchingRosterMember);
        if (!isMember) continue;
        playedTournamentIds.add(tournament.id);
        if (participant.is_winner) wins += 1;
        if (tournament.team_size === 1) kills += participant.kills || 0;
        else if (matchingRosterMember) {
          const memberKills = participant.stats?.member_kills as Record<string, number> | undefined;
          kills += Number(memberKills?.[matchingRosterMember.uid] || 0);
        }
      }
    }
    profile.current_rating = rating;
    profile.highest_rating = peak;
    profile.total_tournaments = playedTournamentIds.size;
    profile.total_wins = wins;
    profile.total_kills = kills;
    profile.updated_at = new Date().toISOString();
  }
  persistStore(store);
}
