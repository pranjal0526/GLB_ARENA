'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Tournament,
  Registration,
  Payment,
  Match,
  Profile,
  AdminAuditLog,
  TournamentMode,
  TournamentFormat,
  GameTitle,
  TournamentStatus,
  PrizeAward,
} from '@/lib/supabase/types';
import { 
  getTournaments, 
  createTournament, 
  updateTournament,
  updateTournamentStatus, 
  deleteArchivedTournament,
  releaseRoomDetails,
  getTournamentRoomCredentials,
} from '@/lib/services/tournament-service';
import { 
  getAllPayments, 
  verifyPayment, 
  rejectPayment 
} from '@/lib/services/payment-service';
import { 
  getMatchesByTournament, 
  generateSingleEliminationFixtures, 
  advanceSingleEliminationRound,
  generateBattleRoyaleLobby, 
  createCustomMatch,
  releaseMatchRoomCredentials,
  recordMatchResults 
} from '@/lib/services/fixture-service';
import { 
  getAllProfiles, 
  banUser, 
  unbanUser 
} from '@/lib/services/profile-service';
import { 
  getAuditLogs 
} from '@/lib/services/audit-service';
import { getAllRegistrations } from '@/lib/services/registration-service';
import { getPaidRegistrationEnabled, setPaidRegistrationEnabled } from '@/lib/services/platform-settings';
import { getAllPrizeAwards, markPrizeAwardPaid } from '@/lib/services/prize-service';
import { isManualPaymentConfigured } from '@/lib/config/payments';
import { getTournamentBanner } from '@/lib/utils/tournament-banner';
import { StatusBadge } from '@/components/status-badge';
import { GameIdVerificationInbox } from '@/components/game-id-verification';
import { PlayerAccountDetails } from '@/components/admin/player-account-details';
import { 
  Shield, 
  Lock, 
  Unlock, 
  Key, 
  CreditCard, 
  Users, 
  Trophy, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Download, 
  Swords, 
  FileText, 
  AlertCircle, 
  Flame, 
  LogOut, 
  Sliders, 
  Copy, 
  Check, 
  ExternalLink,
  ChevronRight,
  MapPin,
  Pencil,
  Award,
  Trash2,
} from 'lucide-react';

const IST_OFFSET_MINUTES = 330;
const toIstDateTimeInput = (date: Date) =>
  new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
const fromIstDateTimeInput = (value: string) => {
  const date = new Date(`${value}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const isArchivedTournament = (status: TournamentStatus) => status === 'completed' || status === 'cancelled';
const placeOrdinal = (placeNumber: number) =>
  `${placeNumber}${placeNumber % 100 >= 11 && placeNumber % 100 <= 13 ? 'th' : placeNumber % 10 === 1 ? 'st' : placeNumber % 10 === 2 ? 'nd' : placeNumber % 10 === 3 ? 'rd' : 'th'} Place`;
const getBattleRoyaleLobbyDescription = (label: string) =>
  label.replace(/^Match\s*\d+\s*[-:·]?\s*/i, '').replace(/^\((.*)\)$/, '$1').trim() || 'Battle Royale lobby';

export default function SecureAdminPortalPage() {
  const router = useRouter();
  const { currentUser, isAdmin, isLoading: authLoading, signOut } = useAuth();
  const adminId = currentUser?.id || '';

  // Navigation
  const [activeTab, setActiveTab] = useState<
    'overview' | 'payments' | 'payouts' | 'tournaments' | 'fixtures' | 'scoring' | 'players' | 'audit'
  >('overview');

  // Datasets
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [prizeAwards, setPrizeAwards] = useState<PrizeAward[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [paidRegistrationEnabled, setPaidRegistrationEnabledState] = useState<boolean | null>(null);
  const [isSavingPaymentSetting, setIsSavingPaymentSetting] = useState(false);

  // Selected filters
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [tournamentListView, setTournamentListView] = useState<'active' | 'archive'>('active');
  const [fixtureMatchView, setFixtureMatchView] = useState<'active' | 'past'>('active');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('submitted');
  const [playerSearch, setPlayerSearch] = useState('');
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [deletingPlayerId, setDeletingPlayerId] = useState('');

  // Modals & Action States
  const [rejectPaymentModal, setRejectPaymentModal] = useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [releaseRoomModal, setReleaseRoomModal] = useState<Tournament | null>(null);
  const [releaseMatchModal, setReleaseMatchModal] = useState<Match | null>(null);
  const [customRoomId, setCustomRoomId] = useState('');
  const [customRoomPass, setCustomRoomPass] = useState('');
  const [matchRoomId, setMatchRoomId] = useState('');
  const [matchRoomPass, setMatchRoomPass] = useState('');

  // Custom Match / Fixture Builder State (Create on organizer terms!)
  const [customMatchModal, setCustomMatchModal] = useState(false);
  const [cmRoundLabel, setCmRoundLabel] = useState('Match 1');
  const [cmMap, setCmMap] = useState('Erangel');
  const [cmRoomId, setCmRoomId] = useState('');
  const [cmRoomPass, setCmRoomPass] = useState('');
  const [cmTime, setCmTime] = useState('');

  // Match Scoring State
  const [scoreMatchModal, setScoreMatchModal] = useState<Match | null>(null);
  const [isFinalizingMatch, setIsFinalizingMatch] = useState(false);
  const [matchScores, setMatchScores] = useState<
    Array<{ registrationId: string; kills: number; points: number; isWinner: boolean; placement?: number; memberKills?: Record<string, string> }>
  >([]);

  // Player Ban Modal
  const [banPlayerModal, setBanPlayerModal] = useState<Profile | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('');

  // New Tournament Creator (Extensive on Organizer Terms)
  const [createTournamentOpen, setCreateTournamentOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newGame, setNewGame] = useState<GameTitle>('BGMI');
  const [newMode, setNewMode] = useState<TournamentMode>('Squad');
  const [newFormat, setNewFormat] = useState<TournamentFormat>('Battle Royale');
  const [newTeamSize, setNewTeamSize] = useState('4');
  const [newMaxSlots, setNewMaxSlots] = useState('25');
  const [newEntryFeeInr, setNewEntryFeeInr] = useState('100');
  const [newPrizePoolInr, setNewPrizePoolInr] = useState('5000');
  const [newRegistrationOpensAt, setNewRegistrationOpensAt] = useState(() => toIstDateTimeInput(new Date(Date.now() + 60 * 60_000)));
  const [newRegistrationClosesAt, setNewRegistrationClosesAt] = useState(() => toIstDateTimeInput(new Date(Date.now() + 3 * 86400_000)));
  const [newStartTime, setNewStartTime] = useState(() => toIstDateTimeInput(new Date(Date.now() + 4 * 86400_000)));
  const [newDescription, setNewDescription] = useState('');
  const [newPrizeDistribution, setNewPrizeDistribution] = useState([
    { place: '1st Place', amount: '2500' },
    { place: '2nd Place', amount: '1500' },
    { place: '3rd Place', amount: '1000' },
  ]);
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [newRules, setNewRules] = useState(
    '1. Emulator, iPad, and 3rd party triggers are strictly banned.\n2. In-game name and UID must match registered records.\n3. POV recording mandatory for top 3 teams.\n4. Toxic language or abuse will trigger an immediate ban.'
  );

  const loadAllData = async () => {
    try {
      const tournamentRows = await getTournaments();
      const tList = await Promise.all(tournamentRows.map(async (tournament) => {
        const credentials = await getTournamentRoomCredentials(tournament.id);
        return credentials ? { ...tournament, ...credentials } : tournament;
      }));
      setTournaments(tList);
      if (!selectedTournamentId && tList.length > 0) {
        const initialTournament = tList.find((tournament) => !isArchivedTournament(tournament.status)) || tList[0];
        setSelectedTournamentId(initialTournament.id);
        setCmMap(initialTournament.game === 'BGMI' ? 'Erangel' : 'Bermuda');
      }
      const pList = await getAllPayments();
      setPayments(pList);
      setPrizeAwards(await getAllPrizeAwards());
      const [registrationList, matchLists] = await Promise.all([
        getAllRegistrations(),
        Promise.all(tList.map((tournament) => getMatchesByTournament(tournament.id, true))),
      ]);
      setRegistrations(registrationList);
      setMatches(matchLists.flat());
      const profs = await getAllProfiles();
      setPlayers(profs);
      const logs = await getAuditLogs();
      setAuditLogs(logs);
      try {
        setPaidRegistrationEnabledState(await getPaidRegistrationEnabled());
      } catch {
        setPaidRegistrationEnabledState(null);
      }
      setAdminError(null);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not load organizer data. Check the Supabase setup and migrations.');
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAllData();

      // Listen for cross-window / component updates
      const handleSync = () => {
        loadAllData();
      };
      window.addEventListener('vyrox_store_updated', handleSync);
      window.addEventListener('storage', handleSync);
      return () => {
        window.removeEventListener('vyrox_store_updated', handleSync);
        window.removeEventListener('storage', handleSync);
      };
    }
  }, [isAdmin]);

  const handleAdminLogout = async () => {
    await signOut();
    router.push('/');
  };

  // Payment Actions
  const handleApprovePayment = async (paymentId: string) => {
    const result = await verifyPayment(paymentId, adminId);
    if (!result.success) { setAdminError(result.error || 'Payment approval failed.'); return; }
    await loadAllData();
  };

  const handleMarkPrizePaid = async (award: PrizeAward) => {
    const reference = window.prompt('Enter the UPI UTR or bank transfer reference (optional):');
    if (reference === null) return;
    const result = await markPrizeAwardPaid(award.id, reference, adminId);
    if (!result.success) { setAdminError(result.error || 'Could not update prize payout.'); return; }
    await loadAllData();
  };

  const handleRejectPayment = async () => {
    if (!rejectPaymentModal || !rejectReason.trim()) return;
    const result = await rejectPayment(rejectPaymentModal.id, rejectReason.trim(), adminId);
    if (!result.success) { setAdminError(result.error || 'Payment rejection failed.'); return; }
    setRejectPaymentModal(null);
    setRejectReason('');
    await loadAllData();
  };

  const handlePaidRegistrationToggle = async () => {
    if (paidRegistrationEnabled === null || isSavingPaymentSetting) return;
    const nextValue = !paidRegistrationEnabled;
    if (nextValue && !isManualPaymentConfigured()) {
      setAdminError('Add the UPI ID and QR image to .env.local, set NEXT_PUBLIC_MANUAL_PAYMENT_ENABLED=true, and restart the server before enabling paid entry.');
      return;
    }
    setAdminError(null);
    setIsSavingPaymentSetting(true);
    try {
      setPaidRegistrationEnabledState(await setPaidRegistrationEnabled(nextValue));
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not update the paid registration setting.');
    } finally {
      setIsSavingPaymentSetting(false);
    }
  };

  // Tournament Actions
  const openTournamentEditor = (tournament: Tournament) => {
    setAdminError(null);
    setEditingTournament(tournament);
    setNewTitle(tournament.title);
    setNewSlug(tournament.slug);
    setNewDescription(tournament.description || '');
    setNewGame(tournament.game === 'Free Fire' ? 'Free Fire' : 'BGMI');
    setNewMode(tournament.mode);
    setNewFormat(tournament.tournament_format);
    setNewTeamSize(String(tournament.team_size));
    setNewMaxSlots(String(tournament.max_slots));
    setNewEntryFeeInr(String(tournament.entry_fee_paise / 100));
    setNewPrizePoolInr(String(tournament.prize_pool_paise / 100));
    setNewRegistrationOpensAt(toIstDateTimeInput(new Date(tournament.registration_opens_at)));
    setNewRegistrationClosesAt(toIstDateTimeInput(new Date(tournament.registration_closes_at)));
    setNewStartTime(toIstDateTimeInput(new Date(tournament.start_time)));
    setNewPrizeDistribution((tournament.prize_distribution || []).map((item) => ({ place: item.place, amount: String(item.amount) })));
    setNewRules(tournament.rules);
    setCreateTournamentOpen(true);
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    const fee = Number(newEntryFeeInr);
    const prize = Number(newPrizePoolInr);
    const opensAt = fromIstDateTimeInput(newRegistrationOpensAt);
    const closesAt = fromIstDateTimeInput(newRegistrationClosesAt);
    const startTime = fromIstDateTimeInput(newStartTime);
    const prizeDistribution = newPrizeDistribution.map((item) => ({
      place: item.place.trim(),
      amount: Number(item.amount),
    }));
    const prizeTotalPaise = Math.round(prizeDistribution.reduce((total, item) => total + item.amount, 0) * 100);
    const prizePoolPaise = Math.round(prize * 100);

    if (!newTitle.trim() || !newRules.trim() || !newSlug.trim()) {
      setAdminError('Enter a tournament title, URL name, and rules before saving.');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(prize) || prize < 0) {
      setAdminError('Entry fee and prize pool must be valid amounts of ₹0 or more.');
      return;
    }
    if (!opensAt || !closesAt || !startTime) {
      setAdminError('Choose valid registration and event dates.');
      return;
    }
    if (new Date(opensAt).getTime() >= new Date(closesAt).getTime()) {
      setAdminError('Registration must close after it opens.');
      return;
    }
    if (new Date(closesAt).getTime() >= new Date(startTime).getTime()) {
      setAdminError('The event must start after registration closes.');
      return;
    }
    if (!Number.isInteger(Number(newMaxSlots)) || Number(newMaxSlots) < 1) {
      setAdminError('Enter at least one team or player slot.');
      return;
    }
    if (!Number.isInteger(Number(newTeamSize)) || Number(newTeamSize) < 1 || Number(newTeamSize) > 6) {
      setAdminError('Team size must be between 1 and 6 players.');
      return;
    }
    if (editingTournament && Number(newMaxSlots) < (editingTournament.registered_count || 0)) {
      setAdminError(`Slots cannot be lower than the ${editingTournament.registered_count} entries already reserved.`);
      return;
    }
    if (editingTournament && (editingTournament.registered_count || 0) > 0 && (
      editingTournament.game !== newGame
      || editingTournament.mode !== newMode
      || editingTournament.team_size !== Number(newTeamSize)
      || editingTournament.tournament_format !== newFormat
      || editingTournament.entry_fee_paise !== Math.round(fee * 100)
    )) {
      setAdminError('Game, format, team size, and entry fee are locked after a player has registered. Other event details can still be edited.');
      return;
    }
    if ((prize > 0 && prizeDistribution.length === 0) || prizeDistribution.some((item) => !item.place || !Number.isFinite(item.amount) || item.amount < 0)) {
      setAdminError('Add at least one valid prize payout, or set every payout to ₹0 for a zero prize pool.');
      return;
    }
    if (prizeTotalPaise !== prizePoolPaise) {
      setAdminError(`Prize payouts must add up to the full prize pool (₹${prize.toLocaleString('en-IN')}).`);
      return;
    }

    setIsCreatingTournament(true);
    try {
      const tournamentData = {
        title: newTitle.trim(),
        slug: editingTournament?.slug || newSlug.trim() || newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: newDescription.trim() || `Official ${newMode} ${newFormat} tournament for ${newGame}.`,
        game: newGame,
        mode: newMode,
        team_size: parseInt(newTeamSize, 10),
        tournament_format: newFormat,
        entry_fee_paise: Math.round(fee * 100),
        prize_pool_paise: prizePoolPaise,
        prize_distribution: prizeDistribution,
        max_slots: parseInt(newMaxSlots, 10),
        registration_opens_at: opensAt,
        registration_closes_at: closesAt,
        start_time: startTime,
        rules: newRules.trim(),
        banner_url: getTournamentBanner(newGame, editingTournament?.slug || newSlug.trim(), newTitle.trim()),
      };

      if (editingTournament) {
        await updateTournament(editingTournament.id, tournamentData, adminId);
      } else {
        await createTournament({
          ...tournamentData,
          status: 'open',
          room_release_policy: '15_min_before',
          room_released: false,
        }, adminId);
      }

      setCreateTournamentOpen(false);
      setEditingTournament(null);
      setNewTitle('');
      setNewSlug('');
      setNewDescription('');
      await loadAllData();
    } catch (error) {
      console.error('Tournament save failed:', error);
      const details = error && typeof error === 'object'
        ? error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
        : null;
      const message = [details?.message, details?.details, details?.hint]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(' ');
      setAdminError(message || (error instanceof Error ? error.message : 'Tournament could not be saved. Please try again.'));
    } finally {
      setIsCreatingTournament(false);
    }
  };

  // Release / Update Room Credentials
  const handleSaveRoomCredentials = async () => {
    if (!releaseRoomModal) return;
    if (!customRoomId.trim() || !customRoomPass.trim()) {
      setAdminError('Enter both the room ID and password.');
      return;
    }
    try {
      await releaseRoomDetails(releaseRoomModal.id, customRoomId.trim(), customRoomPass.trim(), adminId);
      setReleaseRoomModal(null);
      setCustomRoomId('');
      setCustomRoomPass('');
      await loadAllData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not save room details.');
    }
  };

  const handleSaveMatchRoomCredentials = async () => {
    if (!releaseMatchModal) return;
    if (!matchRoomId.trim() || !matchRoomPass.trim()) {
      setAdminError('Enter both the lobby room ID and password.');
      return;
    }
    try {
      const result = await releaseMatchRoomCredentials(releaseMatchModal.id, matchRoomId.trim(), matchRoomPass.trim(), adminId);
      if (!result.success) {
        setAdminError(result.error || 'Could not save lobby room details.');
        return;
      }
      setReleaseMatchModal(null);
      setMatchRoomId('');
      setMatchRoomPass('');
      await loadAllData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not save lobby room details.');
    }
  };

  const handleTournamentStatusChange = async (tournament: Tournament, status: TournamentStatus) => {
    let cancellationReason: string | undefined;
    if (status === 'cancelled') {
      const reason = window.prompt('Why is this event being cancelled?');
      if (reason === null) return;
      cancellationReason = reason.trim();
    }
    setAdminError(null);
    try {
      await updateTournamentStatus(tournament.id, status, cancellationReason, adminId);
      await loadAllData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not update tournament status.');
    }
  };

  const handleDeleteArchivedTournament = async (tournament: Tournament) => {
    const confirmation = window.prompt(`Permanently delete “${tournament.title}” and its registrations, payments, matches, and prize records? Type DELETE to confirm.`);
    if (confirmation !== 'DELETE') return;
    setAdminError(null);
    try {
      await deleteArchivedTournament(tournament.id, adminId);
      if (selectedTournamentId === tournament.id) setSelectedTournamentId('');
      await loadAllData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not delete this event.');
    }
  };

  // Fixture Generators
  const handleGenerateStandardFixtures = async () => {
    if (!selectedTournamentId) return;
    const t = tournaments.find(x => x.id === selectedTournamentId);
    if (!t) return;

    setAdminError(null);
    try {
      const result = t.tournament_format === 'Single Elimination'
        ? await generateSingleEliminationFixtures(selectedTournamentId, adminId)
        : await generateBattleRoyaleLobby(selectedTournamentId, `Match 1 (${t.game === 'BGMI' ? 'Erangel' : 'Bermuda'})`, adminId);
      if (!result.success) {
        setAdminError(result.error || 'Could not create the fixture.');
        return;
      }
      await loadAllData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not create the fixture.');
    }
  };

  const handleAdvanceEliminationRound = async () => {
    if (!selectedTournamentId) return;
    setAdminError(null);
    try {
      const result = await advanceSingleEliminationRound(selectedTournamentId, adminId);
      if (!result.success) {
        setAdminError(result.error || 'Could not create the next knockout round.');
        return;
      }
      if (result.tournamentComplete) {
        setAdminError('The final is complete. Mark the tournament completed in Tournament Studio to archive it.');
        return;
      }
      await loadAllData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not create the next knockout round.');
    }
  };

  // Custom Match Creation on Organizer Terms
  const handleCreateCustomMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournamentId) return;
    setAdminError(null);
    try {
      const result = await createCustomMatch({
        tournamentId: selectedTournamentId,
        roundLabel: `${cmRoundLabel.trim()} (${cmMap})`,
        scheduledTime: (cmTime && fromIstDateTimeInput(cmTime)) || new Date(Date.now() + 2 * 3600000).toISOString(),
        roomId: cmRoomId.trim(),
        roomPassword: cmRoomPass.trim(),
        adminId,
      });
      if (!result.success) {
        setAdminError(result.error || 'Could not create this match.');
        return;
      }
      setCustomMatchModal(false);
      setCmRoomId('');
      setCmRoomPass('');
      await loadAllData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not create this match.');
    }
  };

  // Finalize Results
  const handleFinalizeResults = async () => {
    if (!scoreMatchModal) return;
    setAdminError(null);
    const winnerCount = matchScores.filter((score) => score.isWinner).length;
    if (winnerCount !== 1) {
      setAdminError('Select exactly one winner before finalizing this match.');
      return;
    }
    if (matchScores.some((score) => !Number.isInteger(score.placement) || Number(score.placement) < 1 || !Number.isInteger(score.kills) || score.kills < 0 || !Number.isInteger(score.points) || score.points < 0)) {
      setAdminError('Placements must be positive whole numbers; kills and points must be zero or more.');
      return;
    }
    if (new Set(matchScores.map((score) => score.placement)).size !== matchScores.length) {
      setAdminError('Each participant must have a different placement.');
      return;
    }
    const hasInvalidPlayerKills = matchScores.some((score) => {
      const entered = Object.values(score.memberKills || {}).filter((value) => value.trim() !== '');
      if (entered.length === 0) return false;
      const registration = registrations.find((row) => row.id === score.registrationId);
      const roster = registration?.members || [];
      return roster.length === 0 || roster.some((member) => score.memberKills?.[member.uid]?.trim() === undefined || score.memberKills?.[member.uid]?.trim() === '' || !Number.isInteger(Number(score.memberKills?.[member.uid])) || Number(score.memberKills?.[member.uid]) < 0)
        || roster.reduce((sum, member) => sum + Number(score.memberKills?.[member.uid]), 0) !== score.kills;
    });
    if (hasInvalidPlayerKills) {
      setAdminError('If you enter individual kills, enter a whole number for every roster member and make their total equal the squad kill total.');
      return;
    }
    setIsFinalizingMatch(true);
    try {
      const result = await recordMatchResults(scoreMatchModal.id, matchScores, adminId);
      if (!result.success) {
        setAdminError(result.error || 'Could not finalize results.');
        return;
      }
      setScoreMatchModal(null);
      await loadAllData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not finalize results.');
    } finally {
      setIsFinalizingMatch(false);
    }
  };

  // Bans
  const handleConfirmBan = async () => {
    if (!banPlayerModal || !banReasonInput.trim()) return;
    await banUser(banPlayerModal.id, banReasonInput.trim(), adminId);
    setBanPlayerModal(null);
    setBanReasonInput('');
    await loadAllData();
  };

  const handleLiftBan = async (playerId: string) => {
    await unbanUser(playerId, adminId);
    await loadAllData();
  };

  const handleDeletePlayerAccount = async (player: Profile) => {
    const confirmation = window.prompt(`This permanently deletes ${player.display_name}'s sign-in and player account. Type their username (@${player.username}) to confirm.`);
    if (confirmation !== player.username) return;
    setDeletingPlayerId(player.id);
    setAdminError(null);
    try {
      const response = await fetch(`/api/admin/player-account?id=${encodeURIComponent(player.id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not delete this player account.');
      if (expandedPlayerId === player.id) setExpandedPlayerId(null);
      await loadAllData();
      if (!result.audit_recorded || !result.rankings_refreshed) {
        setAdminError(`The player account was deleted.${!result.audit_recorded ? ' Its admin audit entry could not be written.' : ''}${!result.rankings_refreshed ? ' Competitive rankings could not be recalculated.' : ''} Check the server logs.`);
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not delete this player account.');
    } finally {
      setDeletingPlayerId('');
    }
  };

  // CSV Export
  const handleExportRegistrationsCsv = () => {
    const list = registrations.filter(r => !selectedTournamentId || r.tournament_id === selectedTournamentId);
    let csv = 'RegistrationCode,TournamentTitle,TeamName,BGMI_IGN,BGMI_UID,FreeFire_IGN,FreeFire_UID,Status,SlotNumber,CreatedAt\n';
    list.forEach(r => {
      const t = tournaments.find(x => x.id === r.tournament_id);
      const captain = players.find(x => x.id === r.captain_id);
      csv += `"${r.registration_code}","${t?.title || ''}","${r.team_name || ''}","${captain?.bgmi_ign || ''}","${captain?.bgmi_uid || ''}","${captain?.free_fire_ign || ''}","${captain?.free_fire_uid || ''}","${r.status}",${r.slot_number || 0},"${r.created_at}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vyrox-squads-export-${Date.now()}.csv`;
    a.click();
  };

  // ----------------------------------------------------
  // GATEWAY RENDER: If not authorized, display Security Checkpoint
  // ----------------------------------------------------
  if (authLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center font-mono text-xs text-gray-400">Checking organizer access…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-md text-center space-y-4">
          <Shield className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-2xl font-display font-bold text-white">Organizer access required</h1>
          <p className="text-sm text-gray-400">Sign in with an account assigned the admin role to manage tournaments.</p>
          <Link href="/auth/signin" className="inline-flex px-5 py-2.5 rounded-xl bg-brand-600 text-sm font-semibold text-white">Sign in</Link>
        </div>
      </div>
    );
  }

  // Active counts
  const pendingCount = payments.filter(p => p.payment_status === 'submitted').length;
  const currentTourney = tournaments.find(t => t.id === selectedTournamentId) || tournaments[0];
  const visibleTournaments = tournaments.filter((tournament) =>
    tournamentListView === 'archive' ? isArchivedTournament(tournament.status) : !isArchivedTournament(tournament.status)
  );
  const editingHasEntries = Boolean(editingTournament && (editingTournament.registered_count || 0) > 0);
  const tourneyConfirmedRegs = registrations.filter(
    r => r.tournament_id === currentTourney?.id && r.status === 'confirmed'
  );
  const currentTourneyMatches = matches
    .filter((match) => match.tournament_id === currentTourney?.id)
    .sort((a, b) => currentTourney?.tournament_format === 'Battle Royale'
      ? a.created_at.localeCompare(b.created_at) || a.scheduled_time.localeCompare(b.scheduled_time) || a.id.localeCompare(b.id)
      : a.round_number - b.round_number || a.match_number - b.match_number);
  const currentTourneyIsArchived = Boolean(currentTourney && isArchivedTournament(currentTourney.status));
  const visibleFixtureMatches = currentTourneyMatches.filter((match) => fixtureMatchView === 'active'
    ? !currentTourneyIsArchived && (match.status === 'scheduled' || match.status === 'live')
    : currentTourneyIsArchived || match.status === 'completed' || match.status === 'cancelled');
  const matchDisplayNumbers = new Map(currentTourneyMatches.map((match, index) => [
    match.id,
    currentTourney?.tournament_format === 'Battle Royale' ? index + 1 : match.match_number,
  ] as const));
  const latestRoundNumber = currentTourneyMatches.length ? Math.max(...currentTourneyMatches.map((match) => match.round_number)) : 0;
  const latestRoundMatches = currentTourneyMatches.filter((match) => match.round_number === latestRoundNumber);
  const latestRoundIsComplete = latestRoundMatches.length > 0 && latestRoundMatches.every((match) => match.status === 'completed');
  const isKnockoutTournament = currentTourney?.tournament_format === 'Single Elimination';
  const scoreTournament = tournaments.find((tournament) => tournament.id === scoreMatchModal?.tournament_id);
  const scoreGame = scoreTournament?.game;
  const winnerTerm = scoreGame === 'Free Fire' ? 'Booyah!' : 'WWCD';
  const latestRoundWinnerCount = latestRoundMatches.reduce((total, match) => total + (match.participants || []).filter((participant) => participant.is_winner).length, 0);
  const isKnockoutFinalComplete = isKnockoutTournament && latestRoundIsComplete && latestRoundWinnerCount === 1;
  const fixtureWorkflowSteps = [
    { title: 'Approve entries', detail: `${tourneyConfirmedRegs.length} confirmed / ${currentTourney?.max_slots || 0} slots`, done: tourneyConfirmedRegs.length > 0 },
    { title: 'Create fixtures', detail: currentTourneyMatches.length ? `${currentTourneyMatches.length} match${currentTourneyMatches.length === 1 ? '' : 'es'} across ${latestRoundNumber} round${latestRoundNumber === 1 ? '' : 's'}` : 'Waiting for approved entries', done: currentTourneyMatches.length > 0 },
    { title: 'Set room details', detail: currentTourneyMatches.length ? `${currentTourneyMatches.filter((match) => match.room_released).length} of ${currentTourneyMatches.length} rooms ready` : 'Set a room after creating a match', done: currentTourneyMatches.length > 0 && currentTourneyMatches.every((match) => match.room_released) },
    { title: 'Play & score', detail: currentTourneyMatches.length ? `${currentTourneyMatches.filter((match) => match.status === 'completed').length} of ${currentTourneyMatches.length} matches scored` : 'Scores appear after fixtures are created', done: currentTourneyMatches.length > 0 && currentTourneyMatches.every((match) => match.status === 'completed') },
    { title: isKnockoutTournament ? 'Advance winners' : 'Add next lobby', detail: isKnockoutTournament ? (isKnockoutFinalComplete ? 'Final has a winner' : latestRoundIsComplete ? 'Ready to create the next round' : 'Score every match to unlock') : 'Create another lobby when ready', done: isKnockoutTournament ? latestRoundNumber > 1 || isKnockoutFinalComplete : currentTourneyMatches.length > 1 },
    { title: 'Complete event', detail: currentTourney?.status === 'completed' ? 'Moved to the organizer archive' : 'Mark completed to archive this event', done: currentTourney?.status === 'completed' || currentTourney?.status === 'cancelled' },
  ];
  const completedScoringMatches = currentTourneyMatches.filter((match) => match.status === 'completed');
  const standingsByEntry = new Map<string, {
    registrationId: string;
    name: string;
    matchesPlayed: number;
    wins: number;
    totalPoints: number;
    totalKills: number;
  }>();
  completedScoringMatches.forEach((match) => {
    (match.participants || []).forEach((participant, index) => {
      const registrationId = participant.registration_id;
      const standing = standingsByEntry.get(registrationId) || {
        registrationId,
        name: participant.registration?.team_name || participant.registration?.captain?.display_name || `Entry ${index + 1}`,
        matchesPlayed: 0,
        wins: 0,
        totalPoints: 0,
        totalKills: 0,
      };
      standing.matchesPlayed += 1;
      standing.wins += participant.is_winner ? 1 : 0;
      standing.totalPoints += Number(participant.points) || 0;
      standing.totalKills += Number(participant.kills) || 0;
      standingsByEntry.set(registrationId, standing);
    });
  });
  const tournamentStandings = Array.from(standingsByEntry.values()).sort((a, b) =>
    b.totalPoints - a.totalPoints || b.totalKills - a.totalKills || b.wins - a.wins || a.name.localeCompare(b.name)
  );

  return (
    <div className="min-h-screen bg-[#07080a] text-foreground">
      {/* 1. TOP COMMAND BAR */}
      <header className="border-b border-surface-border bg-surface-200/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white font-black text-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display font-black text-white text-base tracking-wider flex items-center gap-2">
                <span>VYROX ORGANIZER COMMAND</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-500/40">
                  CONFIDENTIAL
                </span>
              </div>
              <div className="text-[10px] font-mono text-gray-400 -mt-0.5">
                BGMI &amp; Free Fire Tournament Administration
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportRegistrationsCsv}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-50 border border-surface-border text-xs font-mono text-cyanAccent-400"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-50 border border-surface-border text-xs font-mono text-gray-300"
            >
              <span>View Player Site</span>
              <ExternalLink className="w-3 h-3" />
            </Link>

            <button
              onClick={handleAdminLogout}
              className="p-2 rounded-lg bg-surface-100 hover:bg-rose-950/40 text-gray-400 hover:text-rose-400 border border-surface-border transition-colors"
              title="Lock Admin Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN ADMIN CONTAINER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {adminError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
            {adminError}
          </div>
        )}
        {/* Navigation Tabs */}
        <div className="flex border-b border-surface-border space-x-2 sm:space-x-6 overflow-x-auto pb-1 text-xs font-mono">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'overview' ? 'border-rose-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'payments' ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>UPI Approvals ({pendingCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('payouts')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'payouts' ? 'border-amber-500 text-amber-300' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Prize payouts ({prizeAwards.filter((award) => award.status === 'pending').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('tournaments')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'tournaments' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Tournaments</span>
          </button>

          <button
            onClick={() => setActiveTab('fixtures')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'fixtures' ? 'border-cyanAccent-500 text-cyanAccent-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Swords className="w-4 h-4" />
            <span>Matches & Rooms</span>
          </button>

          <button
            onClick={() => setActiveTab('scoring')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'scoring' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Match Results</span>
          </button>

          <button
            onClick={() => setActiveTab('players')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'players' ? 'border-rose-500 text-rose-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Players & Anti-Cheat</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'audit' ? 'border-gray-400 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Logs</span>
          </button>
        </div>

        {/* 3. TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
                <div className="text-[10px] font-mono uppercase text-gray-400">Total Players</div>
                <div className="text-2xl font-black font-mono text-white mt-1">{players.length}</div>
              </div>
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
                <div className="text-[10px] font-mono uppercase text-gray-400">Total Events</div>
                <div className="text-2xl font-black font-mono text-brand-400 mt-1">{tournaments.length}</div>
              </div>
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
                <div className="text-[10px] font-mono uppercase text-gray-400">Squad Entries</div>
                <div className="text-2xl font-black font-mono text-cyanAccent-400 mt-1">{registrations.length}</div>
              </div>
              <div className={`p-4 rounded-2xl border ${pendingCount > 0 ? 'bg-amber-950/30 border-amber-500/50' : 'bg-surface-100 border-surface-border'}`}>
                <div className="text-[10px] font-mono uppercase text-amber-400 font-bold">UPI Pending</div>
                <div className="text-2xl font-black font-mono text-amber-300 mt-1">{pendingCount}</div>
              </div>
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
                <div className="text-[10px] font-mono uppercase text-gray-400">Matches Active</div>
                <div className="text-2xl font-black font-mono text-white mt-1">{matches.length}</div>
              </div>
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
                <div className="text-[10px] font-mono uppercase text-gray-400">Security Audits</div>
                <div className="text-2xl font-black font-mono text-gray-300 mt-1">{auditLogs.length}</div>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
                <h3 className="font-display font-bold text-white text-base flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-amber-400" />
                  <span>Pending UPI Verifications</span>
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  {pendingCount} payment transaction references waiting for bank statement confirmation.
                </p>
                <button
                  onClick={() => setActiveTab('payments')}
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider"
                >
                  Open Verification Portal
                </button>
              </div>

              <div className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
                <h3 className="font-display font-bold text-white text-base flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-brand-400" />
                  <span>Custom Game Creator</span>
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  Launch tournaments on your exact terms (slots, rules, multi-stage brackets).
                </p>
                <button
                  onClick={() => {
                    setActiveTab('tournaments');
                    setCreateTournamentOpen(true);
                  }}
                  className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs uppercase tracking-wider"
                >
                  Create Custom Tournament
                </button>
              </div>

              <div className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
                <h3 className="font-display font-bold text-white text-base flex items-center gap-2">
                  <Key className="w-5 h-5 text-cyanAccent-400" />
                  <span>Lobby Room Credentials</span>
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  Release secret Room ID & Password strictly to confirmed squads.
                </p>
                <button
                  onClick={() => setActiveTab('fixtures')}
                  className="w-full py-2.5 rounded-xl bg-cyanAccent-600 hover:bg-cyanAccent-500 text-white font-bold text-xs uppercase tracking-wider"
                >
                  Manage Lobbies & Credentials
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. TAB: PAYMENT APPROVALS */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface-100 border border-surface-border text-xs font-mono">
              <div className="flex items-center gap-3">
                <span className="text-gray-400 uppercase font-bold">Filter By Status:</span>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-lg bg-surface-200 border border-surface-border text-white text-xs font-mono"
                >
                  <option value="submitted">Awaiting Review ({pendingCount})</option>
                  <option value="verified">Approved & Confirmed</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All Submissions</option>
                </select>
              </div>
              <div className="text-gray-400">
                Independent bank verification mandatory prior to approval.
              </div>
            </div>

            <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm font-mono">
                  <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400">
                    <tr>
                      <th className="py-3 px-4">Tournament & Squad</th>
                      <th className="py-3 px-4">Submitted UTR / Ref</th>
                      <th className="py-3 px-4 text-center">Amount Due</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Verification Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border text-xs">
                    {payments
                      .filter(p => paymentFilter === 'all' || p.payment_status === paymentFilter)
                      .map((p) => {
                        const reg = p.registration;
                        const feeInr = p.amount_paise / 100;

                        return (
                          <tr key={p.id} className="hover:bg-surface-50/50">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-white">{reg?.tournament?.title || 'Tournament'}</div>
                              <div className="text-cyanAccent-400 text-[11px] mt-0.5">
                                Squad: <strong className="text-white">{reg?.team_name}</strong> • Code: {reg?.registration_code}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono">
                              <div className="font-black text-white text-sm select-all">{p.transaction_reference}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                Submitted: {new Date(p.submitted_at).toLocaleTimeString('en-IN')}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold text-emerald-400 text-sm">
                              ₹{feeInr}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <StatusBadge status={p.payment_status} size="sm" />
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {p.payment_status === 'submitted' ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleApprovePayment(p.id)}
                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase flex items-center gap-1 shadow-sm"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Approve & Unlock Slot</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRejectPaymentModal(p);
                                      setRejectReason('UTR not matched with bank credit records.');
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-red-950 text-red-300 border border-red-500/30 text-xs font-bold uppercase flex items-center gap-1"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Reject</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-[11px]">
                                  {p.payment_status === 'verified'
                                    ? 'Slot Confirmed & Room Unlocked'
                                    : `Reason: ${p.rejection_reason || 'N/A'}`}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payouts' && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4">
              <h3 className="font-display font-bold text-white">Tournament prize payouts</h3>
              <p className="mt-1 text-xs text-gray-400">Final match results create awards from each tournament’s prize distribution. Send the transfer using your payment provider, then mark the award paid and save its reference here.</p>
            </div>
            <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400 font-mono">
                    <tr><th className="py-3 px-4">Tournament / Team</th><th className="py-3 px-4">Prize recipient</th><th className="py-3 px-4 text-center">Place</th><th className="py-3 px-4 text-right">Amount</th><th className="py-3 px-4 text-center">Status</th><th className="py-3 px-4 text-right">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border text-xs">
                    {prizeAwards.map((award) => <tr key={award.id}>
                      <td className="py-3 px-4"><div className="font-semibold text-white">{award.tournament?.title || 'Tournament'}</div><div className="text-gray-400">{award.registration?.team_name || 'Solo entry'}</div></td>
                      <td className="py-3 px-4 text-white">{award.recipient?.display_name || award.registration?.captain?.display_name || 'Player'}</td>
                      <td className="py-3 px-4 text-center text-amber-300">#{award.place}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-200">₹{(award.amount_paise / 100).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-center"><span className={`font-bold uppercase ${award.status === 'paid' ? 'text-emerald-300' : 'text-amber-300'}`}>{award.status === 'paid' ? 'Paid' : 'Pending'}</span>{award.transfer_reference && <div className="text-gray-500 mt-1">Ref: {award.transfer_reference}</div>}</td>
                      <td className="py-3 px-4 text-right">{award.status === 'pending' ? <button type="button" onClick={() => void handleMarkPrizePaid(award)} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold">Mark paid</button> : <span className="text-gray-500">{award.paid_at ? new Date(award.paid_at).toLocaleDateString('en-IN') : 'Recorded'}</span>}</td>
                    </tr>)}
                    {prizeAwards.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-gray-400">No prize awards yet. Awards appear after an event’s final results are scored.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* 5. TAB: TOURNAMENT STUDIO (Extensive Creation on Organizer Terms) */}
        {activeTab === 'tournaments' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-bold text-white text-xl">Tournament Management</h3>
                <p className="text-xs font-mono text-gray-400 mt-0.5">
                  Set registration dates, event time, entry fees, prize payouts, slots, and rooms.
                </p>
              </div>

              <button
                onClick={() => { setAdminError(null); setEditingTournament(null); setNewTitle(''); setNewSlug(''); setNewDescription(''); setCreateTournamentOpen(true); }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 text-white font-bold text-xs uppercase flex items-center gap-2 shadow-glow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Tournament</span>
              </button>
            </div>

            <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-surface-100 border border-surface-border">
              <div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyanAccent-400" />
                  <h4 className="text-sm font-bold text-white">Paid registration</h4>
                  <span className={`text-[10px] font-bold uppercase ${paidRegistrationEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {paidRegistrationEnabled === null ? 'Setup required' : paidRegistrationEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 max-w-2xl">
                  {paidRegistrationEnabled === null
                    ? 'Apply migration 003_payment_controls_and_private_rosters.sql to add the secure admin switch.'
                    : !isManualPaymentConfigured()
                      ? 'Set NEXT_PUBLIC_MANUAL_PAYMENT_ENABLED=true and configure the UPI ID and QR image in .env.local, then restart the server. The switch stays off until these are ready.'
                      : 'This switch controls paid tournament signups and UPI payment submissions across the platform.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handlePaidRegistrationToggle}
                disabled={paidRegistrationEnabled === null || isSavingPaymentSetting || (!paidRegistrationEnabled && !isManualPaymentConfigured())}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold uppercase disabled:opacity-40 ${paidRegistrationEnabled ? 'bg-rose-950/60 border border-rose-500/30 text-rose-200' : 'bg-emerald-700 text-white'}`}
              >
                {isSavingPaymentSetting ? 'Saving…' : paidRegistrationEnabled ? 'Disable paid entry' : 'Enable paid entry'}
              </button>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-surface-100 border border-surface-border">
              <div className="flex gap-2" role="tablist" aria-label="Tournament lists">
                <button
                  type="button"
                  onClick={() => setTournamentListView('active')}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold ${tournamentListView === 'active' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  Active events ({tournaments.filter((t) => !isArchivedTournament(t.status)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setTournamentListView('archive')}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold ${tournamentListView === 'archive' ? 'bg-surface-200 text-cyanAccent-400' : 'text-gray-400 hover:text-white'}`}
                >
                  Past events ({tournaments.filter((t) => isArchivedTournament(t.status)).length})
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Completed and cancelled events move to Past events automatically.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visibleTournaments.map((t) => (
                <div key={t.id} className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-display font-bold text-white text-lg">{t.title}</h4>
                      <div className="text-xs font-mono text-cyanAccent-400 mt-1 flex flex-wrap gap-2">
                        <span>Mode: {t.mode}</span>
                        <span>•</span>
                        <span>Format: {t.tournament_format}</span>
                        <span>•</span>
                        <span>Slots: {t.registered_count || 0} / {t.max_slots}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-2">
                        Registration: {new Date(t.registration_opens_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} – {new Date(t.registration_closes_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                        <span className="mx-2">•</span>
                        Event: {new Date(t.start_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        Entry: {t.entry_fee_paise === 0 ? 'Free' : `₹${(t.entry_fee_paise / 100).toLocaleString('en-IN')}`} · Prize: ₹{(t.prize_pool_paise / 100).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <StatusBadge status={t.status} size="sm" />
                  </div>

                  <details className="rounded-xl bg-surface-200/70 border border-surface-border">
                    <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 text-xs font-bold text-white">
                      <span>Participant roster · captain and in-game IDs</span>
                      <span className="text-cyanAccent-300">{registrations.filter((registration) => registration.tournament_id === t.id && ['confirmed', 'payment_submitted', 'pending_payment'].includes(registration.status)).length} slots</span>
                    </summary>
                    <div className="border-t border-surface-border divide-y divide-surface-border">
                      {registrations
                        .filter((registration) => registration.tournament_id === t.id && ['confirmed', 'payment_submitted', 'pending_payment'].includes(registration.status))
                        .sort((a, b) => (a.slot_number || 0) - (b.slot_number || 0))
                        .map((registration, index) => (
                          <div key={registration.id} className="px-4 py-3 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong className="text-white">Slot #{registration.slot_number || index + 1} · {registration.team_name || 'Unnamed team'}</strong>
                              <span className="text-gray-400">Captain: {registration.captain?.display_name || 'Unknown'} · {registration.status.replace('_', ' ')}</span>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-2 mt-2">
                              {(registration.members || []).map((member) => (
                                <div key={member.id} className="rounded-lg bg-surface-100 px-3 py-2 text-gray-300">
                                  <span className="font-semibold text-cyanAccent-300">{member.role === 'captain' ? 'Captain' : 'Player'}:</span> {member.ign}
                                  <span className="text-gray-500"> · ID {member.uid}</span>
                                </div>
                              ))}
                              {(!registration.members || registration.members.length === 0) && <span className="text-gray-500">No player IDs recorded.</span>}
                            </div>
                          </div>
                        ))}
                      {registrations.filter((registration) => registration.tournament_id === t.id && ['confirmed', 'payment_submitted', 'pending_payment'].includes(registration.status)).length === 0 && (
                        <p className="px-4 py-3 text-xs text-gray-500">No players have reserved a slot yet.</p>
                      )}
                    </div>
                  </details>

                  {/* Room status preview */}
                  <div className="p-3 rounded-xl bg-surface-200 border border-surface-border text-xs font-mono flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase text-gray-400">Custom Room ID:</span>
                      <div className="font-bold text-white">{t.room_id || 'NOT RELEASED YET'}</div>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-gray-400">Password:</span>
                      <div className="font-bold text-cyanAccent-400">{t.room_password || '••••••••'}</div>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-gray-400">Status:</span>
                      <div className={t.room_released ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {t.room_released ? 'UNLOCKED TO SQUADS' : 'LOCKED'}
                      </div>
                    </div>
                  </div>

                  {/* Organizer Controls */}
                  <div className="pt-3 border-t border-surface-border flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Status:</span>
                      <select
                        value={t.status}
                        onChange={(e) => handleTournamentStatusChange(t, e.target.value as TournamentStatus)}
                        className="px-2.5 py-1 rounded bg-surface-200 border border-surface-border text-white text-xs"
                      >
                        <option value="draft">Draft</option>
                        <option value="open">Open</option>
                        <option value="registration_closed">Registration closed</option>
                        <option value="live">Live</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openTournamentEditor(t)}
                        className="px-3 py-1.5 rounded-lg bg-surface-200 hover:bg-surface-50 border border-surface-border text-white flex items-center gap-1.5 font-bold"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit details</span>
                      </button>
                      <button
                        onClick={async () => {
                          setAdminError(null);
                          setReleaseRoomModal(t);
                          const credentials = await getTournamentRoomCredentials(t.id);
                          setCustomRoomId(credentials?.room_id || '');
                          setCustomRoomPass(credentials?.room_password || '');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-surface-200 hover:bg-surface-50 border border-surface-border text-cyanAccent-400 flex items-center gap-1.5 font-bold"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>Set Room & Pass</span>
                      </button>
                      {tournamentListView === 'archive' && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteArchivedTournament(t)}
                          className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-200 flex items-center gap-1.5 font-bold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete event</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {visibleTournaments.length === 0 && (
                <div className="md:col-span-2 rounded-2xl bg-surface-100 border border-surface-border p-10 text-center text-sm text-gray-400">
                  {tournamentListView === 'archive' ? 'No completed or cancelled events yet.' : 'No active events yet. Create a tournament to get started.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. TAB: FIXTURE STUDIO & ROOMS */}
        {activeTab === 'fixtures' && (
          <div className="space-y-6">
            <section className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-5">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-cyanAccent-400 font-bold">Tournament flow</div>
                <h3 className="text-xl font-display font-bold text-white mt-1">Follow the event from signup to final result</h3>
                <p className="text-xs text-gray-400 mt-1">Choose an event below. Each step shows what is finished and what the organizer should do next.</p>
              </div>
              <div className="flex flex-col md:flex-row md:items-stretch gap-2">
                {fixtureWorkflowSteps.map((step, index) => {
                  const currentStepIndex = fixtureWorkflowSteps.findIndex((item) => !item.done);
                  const isCurrent = currentStepIndex === index;
                  return (
                    <React.Fragment key={step.title}>
                      <div className={`flex-1 min-w-0 rounded-2xl border p-3 ${step.done ? 'border-emerald-500/40 bg-emerald-950/20' : isCurrent ? 'border-cyanAccent-500/50 bg-cyanAccent-950/20' : 'border-surface-border bg-surface-200/50'}`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${step.done ? 'bg-emerald-500 text-black' : isCurrent ? 'bg-cyanAccent-500 text-black' : 'bg-surface-100 text-gray-400'}`}>{step.done ? '✓' : index + 1}</span>
                          <strong className={`text-xs ${step.done ? 'text-emerald-300' : isCurrent ? 'text-cyanAccent-300' : 'text-gray-300'}`}>{step.title}</strong>
                        </div>
                        <p className="text-[10px] leading-relaxed text-gray-400 mt-2">{step.detail}</p>
                      </div>
                      {index < fixtureWorkflowSteps.length - 1 && <div className="hidden md:flex items-center text-gray-600 px-0.5">›</div>}
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="rounded-xl bg-surface-200 px-4 py-3 text-xs text-gray-300">
                {isKnockoutTournament
                  ? 'Knockout: generate the first round, add room details, enter scores and mark one winner per match. Once every match is scored, create the next round from those winners.'
                  : 'Battle Royale: create a lobby for all confirmed entries, add its room details, then enter placements and kills. Add another lobby for each additional map or match.'}
              </div>
            </section>

            <div className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono uppercase text-gray-400 font-bold">Select Competition:</span>
                  <select
                    value={selectedTournamentId}
                    onChange={(e) => {
                      const tournament = tournaments.find((item) => item.id === e.target.value);
                      setSelectedTournamentId(e.target.value);
                      if (tournament) setCmMap(tournament.game === 'BGMI' ? 'Erangel' : 'Bermuda');
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white text-xs font-mono"
                  >
                    {!selectedTournamentId && <option value="">Choose a tournament</option>}
                    <optgroup label="Active events">
                      {tournaments.filter((t) => !isArchivedTournament(t.status)).map((t) => (
                        <option key={t.id} value={t.id}>{t.title} ({t.mode} · {t.tournament_format})</option>
                      ))}
                    </optgroup>
                    <optgroup label="Past events">
                      {tournaments.filter((t) => isArchivedTournament(t.status)).map((t) => (
                        <option key={t.id} value={t.id}>{t.title} · {t.status}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {fixtureMatchView === 'active' && !currentTourneyIsArchived && <div className="flex flex-wrap items-center gap-2">
                  {isKnockoutTournament ? (
                    currentTourneyMatches.length === 0 ? (
                      <button
                        disabled={!selectedTournamentId || tourneyConfirmedRegs.length < 2}
                        onClick={handleGenerateStandardFixtures}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold text-xs disabled:opacity-40"
                      >
                        Generate first bracket round ({tourneyConfirmedRegs.length} confirmed)
                      </button>
                    ) : (
                      <button
                        disabled={!latestRoundIsComplete || isKnockoutFinalComplete}
                        onClick={handleAdvanceEliminationRound}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold text-xs disabled:opacity-40"
                      >
                        {isKnockoutFinalComplete ? 'Final complete' : `Create next round from winners${latestRoundIsComplete ? '' : ' · score current round first'}`}
                      </button>
                    )
                  ) : currentTourneyMatches.length === 0 ? (
                    <button
                      disabled={!selectedTournamentId || tourneyConfirmedRegs.length === 0}
                      onClick={handleGenerateStandardFixtures}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold text-xs disabled:opacity-40"
                    >
                      Create first lobby ({tourneyConfirmedRegs.length} confirmed)
                    </button>
                  ) : null}
                  {!isKnockoutTournament && (
                    <button
                      disabled={!selectedTournamentId || tourneyConfirmedRegs.length === 0}
                      onClick={() => {
                        setAdminError(null);
                        const nextMatchNumber = Math.max(currentTourneyMatches.length, 0, ...currentTourneyMatches.map((match) => match.match_number || 0)) + 1;
                        setCmRoundLabel(`Match ${nextMatchNumber}`);
                        setCmMap(currentTourney?.game === 'Free Fire' ? 'Bermuda' : 'Erangel');
                        setCmTime(toIstDateTimeInput(new Date(Date.now() + 2 * 60 * 60_000)));
                        setCustomMatchModal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-surface-200 hover:bg-surface-50 border border-surface-border text-white font-bold text-xs disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4 inline mr-1" /> Add another Battle Royale lobby
                    </button>
                  )}
                </div>}
              </div>

              {/* Tournament Confirmed Squads preview */}
              <div className="p-4 rounded-2xl bg-surface-200/50 border border-surface-border space-y-2">
                <div className="text-xs font-mono text-gray-400 uppercase font-bold flex items-center justify-between">
                  <span>Confirmed entries for this tournament ({tourneyConfirmedRegs.length}):</span>
                  <span className="text-emerald-400">Only these squads receive Room ID & Password</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
                  {tourneyConfirmedRegs.map((reg, idx) => (
                    <span
                      key={reg.id}
                      className="px-2.5 py-1 rounded-lg bg-surface-100 border border-surface-border text-white flex items-center gap-1.5"
                    >
                      <strong className="text-cyanAccent-400">Slot #{reg.slot_number || idx + 1}:</strong>
                      <span>{reg.team_name}</span>
                    </span>
                  ))}
                  {tourneyConfirmedRegs.length === 0 && (
                    <span className="text-gray-500 text-xs">No confirmed squads yet. Approve pending payments first!</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-100 p-3">
              <div className="flex gap-2" role="tablist" aria-label="Match and room status">
                <button type="button" onClick={() => setFixtureMatchView('active')} className={`rounded-xl px-4 py-2 text-xs font-mono font-bold ${fixtureMatchView === 'active' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  Upcoming &amp; live ({currentTourneyMatches.filter((match) => match.status === 'scheduled' || match.status === 'live').length})
                </button>
                <button type="button" onClick={() => setFixtureMatchView('past')} className={`rounded-xl px-4 py-2 text-xs font-mono font-bold ${fixtureMatchView === 'past' ? 'bg-surface-200 text-cyanAccent-300' : 'text-gray-400 hover:text-white'}`}>
                  Completed &amp; cancelled ({currentTourneyMatches.filter((match) => match.status === 'completed' || match.status === 'cancelled').length})
                </button>
              </div>
              <p className="text-xs text-gray-400">Archived events and completed or cancelled matches appear in the past list.</p>
            </div>

            {/* Fixture Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentTourneyMatches.length === 0 && (
                <div className="md:col-span-2 rounded-2xl bg-surface-100 border border-surface-border p-10 text-center space-y-2">
                  <Swords className="w-9 h-9 text-gray-600 mx-auto" />
                  <h4 className="font-display font-bold text-white">No fixtures yet</h4>
                  <p className="text-xs text-gray-400">{currentTourneyIsArchived ? 'This event is archived; its matches are shown under Completed & cancelled.' : 'Approve entries, then use the button above to create the first bracket round or lobby.'}</p>
                </div>
              )}
              {currentTourneyMatches.length > 0 && visibleFixtureMatches.length === 0 && (
                <div className="md:col-span-2 rounded-2xl bg-surface-100 border border-surface-border p-8 text-center text-sm text-gray-400">
                  {fixtureMatchView === 'active' ? 'There are no upcoming or live matches. Open Completed & cancelled to review past matches.' : 'There are no completed or cancelled matches yet.'}
                </div>
              )}
              {visibleFixtureMatches.map((m) => (
                  <div key={m.id} className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
                    <div className="flex items-center justify-between border-b border-surface-border pb-3">
                      <div>
                        <h4 className="font-display font-bold text-white text-base">
                          {currentTourney?.tournament_format === 'Battle Royale' ? `Match ${matchDisplayNumbers.get(m.id)}` : m.round_label}
                        </h4>
                        <div className="text-xs font-mono text-cyanAccent-400">
                          {currentTourney?.tournament_format === 'Battle Royale'
                            ? getBattleRoyaleLobbyDescription(m.round_label)
                            : `Format: ${m.format}`}
                        </div>
                      </div>
                      <StatusBadge status={m.status} size="sm" />
                    </div>

                    {/* Room details for this match */}
                    <div className="p-3.5 rounded-xl bg-surface-200 border border-surface-border flex items-center justify-between font-mono text-xs">
                      <div>
                        <span className="text-[10px] uppercase text-gray-400">Lobby Room ID:</span>
                        <div className="font-bold text-white text-sm select-all">{m.room_id || 'Not Set'}</div>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-gray-400">Password:</span>
                        <div className="font-bold text-cyanAccent-400 text-sm select-all">{m.room_password || 'Not Set'}</div>
                      </div>
                      <button
                        disabled={currentTourneyIsArchived || fixtureMatchView === 'past' || m.status === 'completed' || m.status === 'cancelled'}
                        onClick={() => {
                          setAdminError(null);
                          setReleaseMatchModal(m);
                          setMatchRoomId(m.room_id || '');
                          setMatchRoomPass(m.room_password || '');
                        }}
                        className="px-2.5 py-1 rounded bg-surface-100 border border-surface-border text-xs text-cyanAccent-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {m.room_released ? 'Edit room' : 'Set room'}
                      </button>
                    </div>

                    {/* Participants list */}
                    <div className="space-y-1.5 font-mono text-xs max-h-48 overflow-y-auto">
                      {m.participants?.map((p, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-surface-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 font-bold">Slot #{p.participant_slot || idx + 1}</span>
                            <span className="text-white font-semibold">{p.registration?.team_name || 'Squad'}</span>
                            {p.is_winner && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                WWCD
                              </span>
                            )}
                          </div>
                          <span className="text-cyanAccent-400">{p.kills} Kills • {p.points} PTS</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        disabled={currentTourneyIsArchived || fixtureMatchView === 'past' || m.status === 'completed' || m.status === 'cancelled'}
                        onClick={() => {
                          setAdminError(null);
                          setScoreMatchModal(m);
                          setMatchScores(
                            (m.participants || []).map((p, index) => ({
                              registrationId: p.registration_id,
                              kills: p.kills,
                              points: p.points,
                              isWinner: p.is_winner,
                              placement: p.placement || index + 1,
                                  memberKills: {},
                            }))
                          );
                        }}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyanAccent-600 text-white font-mono font-bold text-xs uppercase disabled:opacity-50"
                      >
                        {currentTourneyIsArchived ? 'Event archived' : m.status === 'completed' ? 'Results finalized' : m.status === 'cancelled' ? 'Match cancelled' : fixtureMatchView === 'past' ? 'Past match' : 'Enter match results'}
                      </button>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. TAB: MATCH RESULTS */}
        {activeTab === 'scoring' && (
          <div className="space-y-6">
            <section className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">Review final scores</p>
                  <h3 className="mt-1 font-display font-bold text-white text-xl">{currentTourney?.title || 'Choose a tournament'}</h3>
                  <p className="mt-2 text-sm text-gray-400">This page shows saved match results and the event standings. Enter scores in Matches & Rooms.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <label className="text-xs font-mono text-gray-400">
                    Tournament
                    <select
                      value={selectedTournamentId}
                      onChange={(event) => setSelectedTournamentId(event.target.value)}
                      className="mt-1 block w-full sm:min-w-64 px-3 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white"
                    >
                      {!selectedTournamentId && <option value="">Choose a tournament</option>}
                      {tournaments.map((tournament) => (
                        <option key={tournament.id} value={tournament.id}>{tournament.title}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setActiveTab('fixtures')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
                  >
                    Go to Matches & Rooms to enter scores
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-surface-border bg-surface-200/60 p-4 space-y-3">
                <h4 className="text-sm font-bold text-white">How scoring works</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-surface-100 p-3">
                    <p className="text-xs font-bold text-cyanAccent-300">1. Finish position</p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-400">Where the player or squad finished. Enter 1 for first place, 2 for second, and so on.</p>
                  </div>
                  <div className="rounded-xl bg-surface-100 p-3">
                    <p className="text-xs font-bold text-cyanAccent-300">2. Kills</p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-400">Enter the verified total kills for this match. Individual squad kills are optional.</p>
                  </div>
                  <div className="rounded-xl bg-surface-100 p-3">
                    <p className="text-xs font-bold text-amber-300">3. Tournament points</p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-400">Enter points from your event’s score sheet. Battle Royale and round-robin standings add these totals; elimination events advance by match winner.</p>
                  </div>
                  <div className="rounded-xl bg-surface-100 p-3">
                    <p className="text-xs font-bold text-emerald-300">4. VYROX rating</p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-400">Updates when finalized: placement and kills for Battle Royale or round robin, and match win/loss for elimination.</p>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-gray-400">Mark exactly one winner in each match. For knockout events, return to Matches & Rooms after scoring a full round to create the next round from its winners. Prize awards appear in Prize Payouts after the event’s final results.</p>
              </div>
            </section>

            {currentTourney && currentTourney.tournament_format !== 'Single Elimination' && (
              <section className="rounded-3xl bg-surface-100 border border-surface-border overflow-hidden">
                <div className="p-5 border-b border-surface-border">
                  <h3 className="font-display font-bold text-white text-lg">Tournament standings</h3>
                  <p className="mt-1 text-xs text-gray-400">Totals from finalized matches, ranked by points, then kills, then match wins.</p>
                </div>
                {tournamentStandings.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="font-semibold text-white">No scores saved yet</p>
                    <p className="mt-1 text-sm text-gray-400">When you finalize match results, the standings will appear here.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-surface-200 text-xs uppercase text-gray-400">
                        <tr>
                          <th className="px-4 py-3">Rank</th>
                          <th className="px-4 py-3">Player / squad</th>
                          <th className="px-4 py-3 text-center">Matches</th>
                          <th className="px-4 py-3 text-center">Match wins</th>
                          <th className="px-4 py-3 text-center">Tournament points</th>
                          <th className="px-4 py-3 text-center">Kills</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {tournamentStandings.map((standing, index) => (
                          <tr key={standing.registrationId}>
                            <td className="px-4 py-3 font-mono font-bold text-amber-300">{placeOrdinal(index + 1)}</td>
                            <td className="px-4 py-3 font-semibold text-white">{standing.name}</td>
                            <td className="px-4 py-3 text-center text-gray-300">{standing.matchesPlayed}</td>
                            <td className="px-4 py-3 text-center text-gray-300">{standing.wins}</td>
                            <td className="px-4 py-3 text-center font-bold text-amber-300">{standing.totalPoints}</td>
                            <td className="px-4 py-3 text-center font-bold text-cyanAccent-300">{standing.totalKills}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {currentTourney?.tournament_format === 'Single Elimination' && (
              <div className="rounded-2xl border border-cyanAccent-500/30 bg-cyanAccent-950/20 p-4 text-sm text-cyanAccent-100">
                Knockout event: each match winner advances to the next round. See the completed matches below, then use Matches & Rooms to create the next round.
              </div>
            )}

            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-white text-lg">Completed matches</h3>
                  <p className="text-xs text-gray-400">The official result saved for each match in this tournament.</p>
                </div>
                <span className="text-xs font-mono text-gray-400">{completedScoringMatches.length} scored</span>
              </div>
              {!currentTourney ? (
                <div className="p-8 rounded-2xl bg-surface-100 border border-surface-border text-center">
                  <p className="font-semibold text-white">No tournament is available yet.</p>
                  <p className="mt-1 text-sm text-gray-400">Create an event in Tournament Studio, then return here to review its results.</p>
                </div>
              ) : completedScoringMatches.length === 0 ? (
                <div className="p-8 rounded-2xl bg-surface-100 border border-surface-border text-center">
                  <p className="font-semibold text-white">There are no completed matches for this tournament.</p>
                  <p className="mt-1 text-sm text-gray-400">Open Matches & Rooms to set up matches and record results after they are played.</p>
                </div>
              ) : completedScoringMatches.map((match) => {
                const sortedParticipants = [...(match.participants || [])].sort((a, b) =>
                  (a.placement || Number.MAX_SAFE_INTEGER) - (b.placement || Number.MAX_SAFE_INTEGER)
                );
                const displayMatchNumber = matchDisplayNumbers.get(match.id) ?? match.match_number;
                return (
                  <article key={match.id} className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-surface-border">
                      <div>
                        <p className="text-xs font-mono text-cyanAccent-300">
                          {currentTourney?.tournament_format === 'Battle Royale'
                            ? `Match ${displayMatchNumber} · Battle Royale`
                            : `Round ${match.round_number} · Match ${match.match_number} · ${match.format}`}
                        </p>
                        <h4 className="mt-1 font-bold text-white">
                          {currentTourney?.tournament_format === 'Battle Royale'
                            ? getBattleRoyaleLobbyDescription(match.round_label)
                            : match.round_label}
                        </h4>
                      </div>
                      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Results saved
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-surface-200/60 text-[11px] uppercase text-gray-400">
                          <tr>
                            <th className="px-4 py-2.5">Finish</th>
                            <th className="px-4 py-2.5">Player / squad</th>
                            <th className="px-4 py-2.5">Outcome</th>
                            <th className="px-4 py-2.5 text-center">Tournament points</th>
                            <th className="px-4 py-2.5 text-center">Kills</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-border">
                          {sortedParticipants.map((participant) => (
                            <tr key={participant.id}>
                              <td className="px-4 py-3 font-mono text-gray-200">{participant.placement ? placeOrdinal(participant.placement) : 'Not entered'}</td>
                              <td className="px-4 py-3 font-semibold text-white">{participant.registration?.team_name || participant.registration?.captain?.display_name || 'Player / squad'}</td>
                              <td className="px-4 py-3">{participant.is_winner ? <span className="text-amber-300 font-bold">Winner · {currentTourney?.game === 'Free Fire' ? 'Booyah!' : 'WWCD'}</span> : <span className="text-gray-500">—</span>}</td>
                              <td className="px-4 py-3 text-center font-bold text-amber-300">{participant.points}</td>
                              <td className="px-4 py-3 text-center font-bold text-cyanAccent-300">{participant.kills}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        )}

        {/* 8. TAB: PLAYERS & ANTI-CHEAT BANS */}
        {activeTab === 'players' && (
          <div className="space-y-4">
            <GameIdVerificationInbox players={players} />
            <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search players by BGMI ID, Free Fire ID, or username..."
                className="w-full px-4 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-xs font-mono focus:outline-none"
              />
            </div>

            <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm font-mono">
                  <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400">
                    <tr>
                      <th className="py-3 px-4">Player</th>
                      <th className="py-3 px-4">Game Identities</th>
                      <th className="py-3 px-4 text-center">Rating</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Anti-Cheat Enforcement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border text-xs">
                    {players
                      .filter(p => {
                        const q = playerSearch.toLowerCase();
                        return (
                          p.display_name.toLowerCase().includes(q) ||
                          p.username.toLowerCase().includes(q) ||
                          (p.bgmi_ign && p.bgmi_ign.toLowerCase().includes(q)) ||
                          (p.free_fire_ign && p.free_fire_ign.toLowerCase().includes(q))
                        );
                      })
                      .map((p) => (
                        <React.Fragment key={p.id}>
                        <tr className="hover:bg-surface-50/50">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">{p.display_name}</div>
                            <div className="text-gray-400 text-[11px]">@{p.username}</div>
                            <button type="button" onClick={() => setExpandedPlayerId(expandedPlayerId === p.id ? null : p.id)} className="mt-1 text-[11px] font-bold text-cyanAccent-300 hover:text-white">
                              {expandedPlayerId === p.id ? 'Hide account history' : 'View full account history'}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-cyanAccent-400 font-bold">BGMI: {p.bgmi_ign || 'N/A'} <span className="text-gray-500">{p.bgmi_uid || ''}</span></div>
                            <div className="text-orange-300 text-[11px]">Free Fire: {p.free_fire_ign || 'N/A'} <span className="text-gray-500">{p.free_fire_uid || ''}</span></div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-brand-400">
                            {p.current_rating} PTS
                          </td>
                          <td className="py-3 px-4 text-center">
                            <StatusBadge status={p.account_status} size="sm" />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                            {p.account_status === 'banned' ? (
                              <button
                                onClick={() => handleLiftBan(p.id)}
                                className="px-3 py-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-xs font-bold"
                              >
                                Lift Ban
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setBanPlayerModal(p);
                                  setBanReasonInput('Hardware check or POV audit failure.');
                                }}
                                className="px-3 py-1 rounded-lg bg-rose-950 text-rose-300 border border-rose-500/30 text-xs font-bold"
                              >
                                Ban Account
                              </button>
                            )}
                            {p.role === 'player' && p.id !== adminId && (
                              <button
                                type="button"
                                disabled={deletingPlayerId === p.id}
                                onClick={() => void handleDeletePlayerAccount(p)}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-950/60 px-3 py-1 text-xs font-bold text-rose-200 border border-rose-500/30 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> {deletingPlayerId === p.id ? 'Deleting…' : 'Delete account'}
                              </button>
                            )}
                            </div>
                          </td>
                        </tr>
                        {expandedPlayerId === p.id && <tr><td colSpan={5} className="px-4 py-4"><PlayerAccountDetails playerId={p.id} /></td></tr>}
                        </React.Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 10. TAB: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-surface-200/60 border-b border-surface-border uppercase text-gray-400">
                  <tr>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Entity</th>
                    <th className="py-3 px-4">Metadata</th>
                    <th className="py-3 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border text-gray-300">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-50/50">
                      <td className="py-2.5 px-4 font-bold text-cyanAccent-400">{log.action}</td>
                      <td className="py-2.5 px-4 text-gray-400">{log.target_entity}</td>
                      <td className="py-2.5 px-4 text-gray-300 font-sans text-[11px] max-w-xs truncate">
                        {JSON.stringify(log.metadata)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-500">
                        {new Date(log.created_at).toLocaleTimeString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Reject Payment */}
      {rejectPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-white text-base">Reject Payment Submission</h3>
            <p className="text-xs text-gray-400">
              Provide rejection reason for UTR reference <strong className="text-white">{rejectPaymentModal.transaction_reference}</strong>.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 rounded-xl bg-surface-200 border border-surface-border text-white text-xs font-mono"
              rows={3}
              placeholder="e.g. Reference not found in receiving account statements."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectPaymentModal(null)}
                className="px-4 py-2 rounded-lg bg-surface-200 text-xs font-mono text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectPayment}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold text-xs uppercase"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Release Room Details */}
      {releaseRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-3xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-white text-base">Release {releaseRoomModal.game} Custom Room Credentials</h3>
            <p className="text-xs text-gray-400 font-mono">
              These credentials will immediately unlock on confirmed player dashboards for {releaseRoomModal.title}.
            </p>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">{releaseRoomModal.game} Room ID</label>
              <input
                type="text"
                value={customRoomId}
                onChange={(e) => setCustomRoomId(e.target.value)}
                placeholder="e.g. 9817263"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">Room Password</label>
              <input
                type="text"
                value={customRoomPass}
                onChange={(e) => setCustomRoomPass(e.target.value)}
                placeholder="e.g. VYROX_PRO"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm"
              />
            </div>
            {adminError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{adminError}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setReleaseRoomModal(null); setAdminError(null); }}
                className="px-4 py-2 rounded-lg bg-surface-200 text-xs font-mono text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRoomCredentials}
                className="px-4 py-2 rounded-lg bg-cyanAccent-600 text-white font-bold text-xs uppercase"
              >
                Release Credentials
              </button>
            </div>
          </div>
        </div>
      )}

      {releaseMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-3xl p-6 max-w-md w-full space-y-4">
            <div>
              <h3 className="font-display font-bold text-white text-lg">Set lobby room details</h3>
              <p className="text-xs text-gray-400 mt-1">{releaseMatchModal.round_label} · {tournaments.find((tournament) => tournament.id === releaseMatchModal.tournament_id)?.game}</p>
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">Room ID</label>
              <input value={matchRoomId} onChange={(e) => setMatchRoomId(e.target.value)} required className="w-full px-3 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">Room password</label>
              <input value={matchRoomPass} onChange={(e) => setMatchRoomPass(e.target.value)} required className="w-full px-3 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm" />
            </div>
            {adminError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{adminError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setReleaseMatchModal(null); setAdminError(null); }} className="px-4 py-2 rounded-lg bg-surface-200 text-xs text-gray-300">Cancel</button>
              <button onClick={handleSaveMatchRoomCredentials} className="px-4 py-2 rounded-lg bg-cyanAccent-600 text-white font-bold text-xs">Save & release to confirmed players</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Custom Match Builder on Organizer Terms */}
      {customMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-3xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="font-display font-bold text-white text-lg">Add Battle Royale lobby</h3>
              <p className="text-xs text-gray-400 mt-1">All confirmed entries for this event will be placed into this lobby.</p>
            </div>
            <form onSubmit={handleCreateCustomMatch} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-gray-400 uppercase mb-1">Round / Lobby Title</label>
                <input
                  type="text"
                  value={cmRoundLabel}
                  onChange={(e) => setCmRoundLabel(e.target.value)}
                  required
                  placeholder="e.g. Group A - Match 1 (Qualifiers)"
                  className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 uppercase mb-1">{currentTourney?.game || 'Tournament'} Map</label>
                  <select
                    value={cmMap}
                    onChange={(e) => setCmMap(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    {currentTourney?.game === 'Free Fire' ? (
                      <>
                        <option value="Bermuda">Bermuda</option>
                        <option value="Alpine">Alpine</option>
                        <option value="Purgatory">Purgatory</option>
                        <option value="Kalahari">Kalahari</option>
                      </>
                    ) : (
                      <>
                        <option value="Erangel">Erangel</option>
                        <option value="Miramar">Miramar</option>
                        <option value="Sanhok">Sanhok</option>
                        <option value="Vikendi">Vikendi</option>
                        <option value="Warehouse TDM">Warehouse TDM</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 uppercase mb-1">Lobby start time (IST)</label>
                  <input type="datetime-local" value={cmTime} onChange={(e) => setCmTime(e.target.value)} required className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Room ID</label>
                  <input
                    type="text"
                    value={cmRoomId}
                    onChange={(e) => setCmRoomId(e.target.value)}
                    placeholder="e.g. 8172635"
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Room Password</label>
                  <input
                    type="text"
                    value={cmRoomPass}
                    onChange={(e) => setCmRoomPass(e.target.value)}
                    placeholder="e.g. VYROX99"
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-200 text-gray-400 text-[11px]">
                This lobby will include all {tourneyConfirmedRegs.length} confirmed teams / players. Add its actual room ID and password here, or set them later from the match card.
              </div>

              {adminError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{adminError}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setCustomMatchModal(false); setAdminError(null); }}
                  className="px-4 py-2 rounded-lg bg-surface-200 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold uppercase"
                >
                  Create lobby
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Score Match Results */}
      {scoreMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-3xl p-6 max-w-xl w-full space-y-4 max-h-[85vh] overflow-y-auto">
            <div>
              <h3 className="font-display font-bold text-white text-base">Enter match results</h3>
              <p className="mt-1 text-xs text-gray-400">{scoreTournament?.title} · {scoreMatchModal.round_label} · {scoreGame}</p>
            </div>
            <div className="space-y-3 font-mono text-xs">
              {matchScores.map((score, idx) => {
                const reg = registrations.find(r => r.id === score.registrationId);
                return (
                  <div key={idx} className="p-3.5 rounded-xl bg-surface-200 border border-surface-border space-y-2">
                    <div className="flex items-center justify-between font-bold text-white">
                      <span>Slot #{idx + 1}: {reg?.team_name || 'Squad'}</span>
                      <label className="flex items-center gap-1.5 text-amber-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={score.isWinner}
                          onChange={(e) => {
                            const copy = [...matchScores];
                            copy[idx].isWinner = e.target.checked;
                            setMatchScores(copy);
                          }}
                        />
                        <span>Winner ({winnerTerm})</span>
                      </label>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {scoreGame === 'Free Fire' ? 'Booyah! marks the winning player or squad.' : 'WWCD means “Winner Winner Chicken Dinner.” Check this for the winning player or squad.'}
                    </p>
                    <p className="text-[10px] leading-relaxed text-gray-400">
                      Finish position and kills affect Battle Royale and round-robin ratings. Tournament points come from your event score sheet. For elimination events, the selected winner advances. Choose exactly one winner for every match.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-gray-400">Finish position:</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={score.placement || 1}
                          onChange={(e) => {
                            const copy = [...matchScores];
                            copy[idx].placement = parseInt(e.target.value, 10);
                            setMatchScores(copy);
                          }}
                          className="w-full px-2 py-1 rounded bg-surface-100 border border-surface-border text-white text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400">{reg?.tournament?.team_size === 1 ? 'Player kills:' : 'Squad kills:'}</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={score.kills}
                          onChange={(e) => {
                            const copy = [...matchScores];
                            copy[idx].kills = parseInt(e.target.value, 10);
                            setMatchScores(copy);
                          }}
                          className="w-full px-2 py-1 rounded bg-surface-100 border border-surface-border text-white text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400">Tournament points:</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={score.points}
                          onChange={(e) => {
                            const copy = [...matchScores];
                            copy[idx].points = parseInt(e.target.value, 10);
                            setMatchScores(copy);
                          }}
                          className="w-full px-2 py-1 rounded bg-surface-100 border border-surface-border text-white text-xs"
                        />
                      </div>
                    </div>
                    {(reg?.tournament?.team_size || 1) > 1 && (reg?.members?.length || 0) > 0 && (
                      <details className="rounded-lg border border-surface-border bg-surface-100/70 p-2.5">
                        <summary className="cursor-pointer text-[10px] font-bold text-cyanAccent-300">Record individual kills (optional)</summary>
                        <p className="mt-1.5 text-[10px] text-gray-400">If entered, all squad member kills must add up to the squad total. Linked VYROX player profiles receive their own kill totals and kill based rating points.</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {reg?.members?.map((member) => (
                            <label key={member.uid} className="text-[10px] text-gray-400">
                              <span className="block truncate">{member.ign}</span>
                              <input type="number" min="0" step="1" value={score.memberKills?.[member.uid] ?? ''} placeholder="Kills"
                                onChange={(event) => {
                                  const copy = [...matchScores];
                                  copy[idx].memberKills = { ...(copy[idx].memberKills || {}), [member.uid]: event.target.value };
                                  setMatchScores(copy);
                                }} className="mt-1 w-full px-2 py-1 rounded bg-surface-200 border border-surface-border text-white text-xs" />
                            </label>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
            {adminError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{adminError}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setScoreMatchModal(null)}
                className="px-4 py-2 rounded-lg bg-surface-200 text-xs font-mono text-gray-300"
              >
                Cancel
              </button>
              <button
                disabled={isFinalizingMatch}
                onClick={handleFinalizeResults}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs uppercase disabled:opacity-50"
              >
                {isFinalizingMatch ? 'Finalizing…' : 'Finalize score & update ratings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ban Player */}
      {banPlayerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-white text-base">Enforce Anti-Cheat Account Ban</h3>
            <p className="text-xs text-gray-400 font-mono">
              Banning <strong className="text-white">@{banPlayerModal.username}</strong> immediately locks them from entering any tournament.
            </p>
            <input
              type="text"
              value={banReasonInput}
              onChange={(e) => setBanReasonInput(e.target.value)}
              placeholder="e.g. Failure to submit required match POV recording"
              className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white text-xs font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBanPlayerModal(null)}
                className="px-4 py-2 rounded-lg bg-surface-200 text-xs font-mono text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBan}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-xs uppercase"
              >
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create Tournament on Organizer Terms */}
      {createTournamentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-3xl p-6 md:p-8 max-w-3xl w-full space-y-5 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="font-display font-bold text-white text-xl">{editingTournament ? 'Edit tournament' : 'Create tournament'}</h3>
              <p className="text-sm text-gray-400 mt-1">Set the schedule and payout plan. A unique event banner is generated automatically.</p>
            </div>
            <form onSubmit={handleCreateTournament} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-400 uppercase mb-1">Tournament Title</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => {
                        setNewTitle(e.target.value);
                        if (!editingTournament) setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                      }}
                      required
                      placeholder={`e.g. ${newGame} Pro Squad League Season 1`}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 uppercase mb-1">Event URL name</label>
                    <input
                      type="text"
                      value={newSlug}
                      onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''))}
                      required
                      readOnly={Boolean(editingTournament)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white"
                    />
                    {editingTournament && <p className="text-[10px] text-gray-500 mt-1">The public URL stays the same so existing links keep working.</p>}
                  </div>
                </div>
                <div className="relative h-28 md:h-full min-h-28 rounded-2xl overflow-hidden border border-surface-border bg-surface-200">
                  <img src={getTournamentBanner(newGame, editingTournament?.slug || newSlug || newTitle || newGame, newTitle || `${newGame} Arena`)} alt={`${newGame} tournament banner preview`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent flex flex-col justify-end p-3">
                    <span className="text-[10px] uppercase text-cyanAccent-300">Automatic event banner</span>
                    <strong className="text-white text-sm">{newGame} Arena</strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Game</label>
                  <select
                    value={newGame}
                    onChange={(e) => {
                      const game = e.target.value as GameTitle;
                      setNewGame(game);
                    }}
                    disabled={editingHasEntries}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="BGMI">BGMI</option>
                    <option value="Free Fire">Free Fire</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Team Mode</label>
                  <select
                    value={newMode}
                    onChange={(e) => {
                      const mode = e.target.value as TournamentMode;
                      setNewMode(mode);
                      setNewTeamSize(mode === 'Squad' ? '4' : mode === 'Duo' ? '2' : '1');
                    }}
                    disabled={editingHasEntries}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="Squad">Squad (4 players)</option>
                    <option value="1v1">1v1 Arena</option>
                    <option value="Solo">Solo</option>
                    <option value="Duo">Duo (2 players)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Format</label>
                  <select
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value as TournamentFormat)}
                    disabled={editingHasEntries}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="Battle Royale">Battle Royale lobbies</option>
                    <option value="Single Elimination">Single Elimination knockout</option>
                  </select>
                </div>
              </div>

              {editingHasEntries && <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-[11px] text-amber-200">Players are already registered. Game, team mode, format, team size, and entry fee are locked to protect existing entries and payments.</p>}

              <section className="p-4 rounded-2xl bg-surface-200/60 border border-surface-border space-y-3">
                <div>
                  <h4 className="text-white font-bold">Registration & event schedule</h4>
                  <p className="text-[11px] text-gray-400 mt-1">Choose dates in Indian Standard Time (IST).</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-gray-400 uppercase mb-1">Registration opens</label>
                    <input type="datetime-local" value={newRegistrationOpensAt} min={editingTournament ? undefined : toIstDateTimeInput(new Date())} onChange={(e) => setNewRegistrationOpensAt(e.target.value)} required className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white" />
                  </div>
                  <div>
                    <label className="block text-gray-400 uppercase mb-1">Registration closes</label>
                    <input type="datetime-local" value={newRegistrationClosesAt} min={editingTournament ? undefined : newRegistrationOpensAt || undefined} onChange={(e) => setNewRegistrationClosesAt(e.target.value)} required className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white" />
                  </div>
                  <div>
                    <label className="block text-gray-400 uppercase mb-1">Tournament starts</label>
                    <input type="datetime-local" value={newStartTime} min={editingTournament ? undefined : newRegistrationClosesAt || undefined} onChange={(e) => setNewStartTime(e.target.value)} required className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white" />
                  </div>
                </div>
              </section>

              <div>
                <label className="block text-gray-400 uppercase mb-1">Tournament description, maps & qualification notes</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  placeholder="Example: Erangel and Miramar · Top 8 squads advance to the final. Placeholder text is only an example; it is not saved."
                  className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <section className="p-4 rounded-2xl bg-surface-200/60 border border-surface-border space-y-3">
                <h4 className="text-white font-bold">Entry fee & prize plan</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-gray-400 uppercase mb-1">Entry fee (₹)</label>
                    <input type="number" min="0" step="0.01" value={newEntryFeeInr} onChange={(e) => setNewEntryFeeInr(e.target.value)} required disabled={editingHasEntries} className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white disabled:opacity-60" />
                  </div>
                  <div>
                    <label className="block text-gray-400 uppercase mb-1">Total prize pool (₹)</label>
                    <input type="number" min="0" step="0.01" value={newPrizePoolInr} onChange={(e) => setNewPrizePoolInr(e.target.value)} required className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white" />
                  </div>
                  <div>
                    <label className="block text-gray-400 uppercase mb-1">Team / player slots</label>
                    <input type="number" min={Math.max(1, editingTournament?.registered_count || 0)} step="1" value={newMaxSlots} onChange={(e) => setNewMaxSlots(e.target.value)} required className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div>
                    <h5 className="text-white font-semibold">Who gets the prize?</h5>
                    <p className="text-[11px] text-gray-400">Payout amounts must add up to the total prize pool.</p>
                  </div>
                  <button type="button" onClick={() => setNewPrizeDistribution((items) => [...items, { place: placeOrdinal(items.length + 1), amount: '0' }])} className="px-3 py-2 rounded-lg bg-surface-100 border border-surface-border text-cyanAccent-400 font-bold">+ Add payout</button>
                </div>
                <div className="space-y-2">
                  {newPrizeDistribution.map((item, index) => (
                    <div key={`payout-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <input aria-label={`Payout place ${index + 1}`} value={item.place} onChange={(e) => setNewPrizeDistribution((items) => items.map((payout, payoutIndex) => payoutIndex === index ? { ...payout, place: e.target.value } : payout))} placeholder="e.g. 1st Place" className="min-w-0 px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white" />
                      <input aria-label={`Payout amount ${index + 1}`} type="number" min="0" step="0.01" value={item.amount} onChange={(e) => setNewPrizeDistribution((items) => items.map((payout, payoutIndex) => payoutIndex === index ? { ...payout, amount: e.target.value } : payout))} placeholder="Amount in ₹" className="min-w-0 px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white" />
                      <button type="button" aria-label={`Remove payout ${index + 1}`} disabled={newPrizeDistribution.length <= 1} onClick={() => setNewPrizeDistribution((items) => items.filter((_, payoutIndex) => payoutIndex !== index))} className="px-3 rounded-xl bg-surface-100 border border-surface-border text-rose-300 disabled:opacity-40">Remove</button>
                    </div>
                  ))}
                </div>
                {(() => {
                  const total = newPrizeDistribution.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                  const target = Number(newPrizePoolInr) || 0;
                  const matches = Math.round(total * 100) === Math.round(target * 100);
                  return <div className={`text-[11px] ${matches ? 'text-emerald-300' : 'text-amber-300'}`}>Allocated: ₹{total.toLocaleString('en-IN')} of ₹{target.toLocaleString('en-IN')} {matches ? '· balanced' : '· adjust payouts before publishing'}</div>;
                })()}
              </section>

              <div>
                <label className="block text-gray-400 uppercase mb-1">Rules & anti-cheat</label>
                <textarea
                  value={newRules}
                  onChange={(e) => setNewRules(e.target.value)}
                  rows={3}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              {adminError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{adminError}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isCreatingTournament}
                  onClick={() => { setCreateTournamentOpen(false); setEditingTournament(null); setAdminError(null); }}
                  className="px-4 py-2 rounded-lg bg-surface-200 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTournament}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold disabled:opacity-50"
                >
                  {isCreatingTournament ? 'Saving…' : editingTournament ? 'Save changes' : 'Publish Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
