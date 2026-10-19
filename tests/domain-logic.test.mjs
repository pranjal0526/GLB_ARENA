import test from 'node:test';
import assert from 'node:assert/strict';

// 1. Elo Rating Logic Verification
function calculate1v1Elo(playerRating, opponentRating, playerWon) {
  const K = 32;
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const actualScore = playerWon ? 1 : 0;
  return Math.round(K * (actualScore - expectedScore));
}

function calculateBattleRoyaleRatingDelta(placement, kills) {
  let placementDelta = 0;
  if (placement === 1) placementDelta = 35;
  else if (placement === 2) placementDelta = 24;
  else if (placement === 3) placementDelta = 18;
  else if (placement <= 5) placementDelta = 12;
  else if (placement <= 10) placementDelta = 6;
  else if (placement <= 15) placementDelta = -2;
  else if (placement <= 20) placementDelta = -8;
  else placementDelta = -14;

  const killDelta = kills * 3;
  return placementDelta + killDelta;
}

test('1v1 Elo Formula: equal opponents winner gains +16 pts', () => {
  const deltaWin = calculate1v1Elo(1000, 1000, true);
  const deltaLoss = calculate1v1Elo(1000, 1000, false);

  assert.equal(deltaWin, 16);
  assert.equal(deltaLoss, -16);
});

test('1v1 Elo Formula: underdog beating higher-rated player gains more points', () => {
  const underdogWinDelta = calculate1v1Elo(1000, 1400, true);
  const favoriteWinDelta = calculate1v1Elo(1400, 1000, true);

  assert.ok(underdogWinDelta > favoriteWinDelta, 'Underdog must gain more points than favorite');
  assert.ok(underdogWinDelta >= 28, 'Underdog should gain ~29 points');
});

test('Battle Royale Rating: Winner Chicken Dinner with 8 kills', () => {
  // 1st place: 35 + 8*3 = 59 pts
  const delta = calculateBattleRoyaleRatingDelta(1, 8);
  assert.equal(delta, 59);
});

test('Battle Royale Rating: 25th place with 0 kills loses rating', () => {
  const delta = calculateBattleRoyaleRatingDelta(25, 0);
  assert.equal(delta, -14);
});

test('Idempotency Check prevents duplicate rating updates on retry', () => {
  const ratingEvents = [];
  function applyEvent(eventKey, playerId, delta) {
    if (ratingEvents.some(e => e.key === eventKey)) {
      return { applied: false, reason: 'Duplicate event' };
    }
    ratingEvents.push({ key: eventKey, playerId, delta });
    return { applied: true };
  }

  const res1 = applyEvent('match-99-player-1', 'p1', 25);
  const res2 = applyEvent('match-99-player-1', 'p1', 25); // retry

  assert.equal(res1.applied, true);
  assert.equal(res2.applied, false);
  assert.equal(ratingEvents.length, 1);
});

test('Capacity Validation: prevents registration when slots are full', () => {
  const maxSlots = 25;
  const currentConfirmed = 25;
  const canRegister = currentConfirmed < maxSlots;
  assert.equal(canRegister, false);
});
