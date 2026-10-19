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
  profile.updated_at = new Date().toISOString();
  persistStore(store);

  return event;
}
