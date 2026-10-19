import test from 'node:test';
import assert from 'node:assert/strict';

// Import domain services
import { 
  getTournaments, 
  getTournamentById, 
  createTournament 
} from '../lib/services/tournament-service';
import { 
  registerForTournament, 
  getUserRegistrations, 
  getRegistrationsByTournament 
} from '../lib/services/registration-service';
import { 
  submitUpiPayment, 
  getAllPayments, 
  verifyPayment, 
  rejectPayment 
} from '../lib/services/payment-service';
import { 
  generateSingleEliminationFixtures, 
  generateBattleRoyaleLobby, 
  recordMatchResults, 
  getMatchesByTournament 
} from '../lib/services/fixture-service';
import { 
  getProfile, 
  getLeaderboard, 
  banUser 
} from '../lib/services/profile-service';
import { getAuditLogs } from '../lib/services/audit-service';
import { getStore } from '../lib/services/store';

test('END-TO-END FLOW: Register -> UPI Submit -> Verify -> Fixture -> Scoring -> Rating Update', async () => {
  const store = getStore();

  // 1. Initial State Check
  const player = await getProfile('p-player-01');
  assert.ok(player, 'Player profile must exist');
  const initialRating = player.current_rating;
  const initialTourneys = player.total_tournaments;
  const initialWins = player.total_wins;

  // 2. Select Tournament
  const tournament = store.tournaments.find(t => t.id === 't-01-winter-champ');
  assert.ok(tournament, 'Winter Championship must exist');
  assert.equal(tournament.status, 'open', 'Tournament must be open');

  // 3. Register Squad
  const regResult = await registerForTournament({
    tournamentId: tournament.id,
    captainId: 'p-player-05', // Aadi Sawant (Dynamo)
    teamName: 'Team Hydra Official',
    ign: 'HYDRA_Dynamo',
    uid: '5562718293',
    teammates: [
      { ign: 'HYDRA_Alpha', uid: '5562718294' },
      { ign: 'HYDRA_Beta', uid: '5562718295' },
      { ign: 'HYDRA_Delta', uid: '5562718296' },
    ],
  });

  assert.equal(regResult.success, true, 'Registration must succeed');
  assert.equal(regResult.registration?.status, 'pending_payment', 'Paid tournament must start as pending_payment');
  assert.ok(regResult.registration?.registration_code.startsWith('VYR-'), 'Must have valid registration code');

  // 4. Duplicate Registration Prevention
  const dupResult = await registerForTournament({
    tournamentId: tournament.id,
    captainId: 'p-player-05',
    teamName: 'Duplicate Squad',
    ign: 'HYDRA_Dynamo',
    uid: '5562718293',
  });
  assert.equal(dupResult.success, false, 'Duplicate registration must be rejected');
  assert.match(dupResult.error, /already registered/i);

  // 5. Submit UPI Payment Transaction Reference
  const regId = regResult.registration.id;
  const paymentResult = await submitUpiPayment({
    registrationId: regId,
    transactionReference: '998877665544',
  });
  assert.equal(paymentResult.success, true, 'Payment submission must succeed');
  assert.equal(paymentResult.payment?.payment_status, 'submitted', 'Payment status must be submitted (pending review)');

  // 6. Admin Verifies Payment
  const adminId = 'p-admin-01';
  const verifyResult = await verifyPayment(paymentResult.payment.id, adminId);
  assert.equal(verifyResult.success, true, 'Payment verification must succeed');

  // Verify registration is now confirmed
  const tournamentRegs = await getRegistrationsByTournament(tournament.id);
  const updatedReg = tournamentRegs.find(r => r.id === regId);
  assert.equal(updatedReg?.status, 'confirmed', 'Registration must be confirmed after payment approval');

  // 7. Generate Fixtures (Custom Battle Royale Lobby)
  const lobbyResult = await generateBattleRoyaleLobby(tournament.id, 'Grand Finals Lobby', adminId);
  assert.equal(lobbyResult.success, true, 'Lobby fixture generation must succeed');
  assert.ok(lobbyResult.match, 'Match fixture must exist');

  // 8. Record Match Results
  const matchId = lobbyResult.match.id;
  const scoreResult = await recordMatchResults(
    matchId,
    [
      {
        registrationId: regId,
        placement: 1, // Winner Chicken Dinner!
        kills: 10,
        points: 45,
        isWinner: true,
      },
    ],
    adminId
  );
  assert.equal(scoreResult.success, true, 'Results finalization must succeed');

  // 9. Verify Player Stats and Persistent Rating Updated
  const updatedPlayer = await getProfile('p-player-05');
  assert.ok(updatedPlayer);
  assert.ok(updatedPlayer.current_rating > 1180, 'Winner rating must increase');
  // 1st place: +35 + 10 kills * 3 = +65 points -> 1180 + 65 = 1245
  assert.equal(updatedPlayer.current_rating, 1180 + 65);
  assert.equal(updatedPlayer.total_wins, 3 + 1);
  assert.equal(updatedPlayer.total_kills, 54 + 10);

  // 10. Audit Log Verified
  const logs = await getAuditLogs();
  assert.ok(logs.some(l => l.action === 'PAYMENT_VERIFIED'), 'PAYMENT_VERIFIED log must exist');
  assert.ok(logs.some(l => l.action === 'RESULT_FINALIZED'), 'RESULT_FINALIZED log must exist');
});
