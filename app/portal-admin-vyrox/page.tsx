'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Tournament, 
  Registration, 
  Payment, 
  Match, 
  Profile, 
  AdminAuditLog, 
  Announcement,
  TournamentMode,
  TournamentFormat
} from '@/lib/supabase/types';
import { 
  getTournaments, 
  createTournament, 
  updateTournamentStatus, 
  releaseRoomDetails 
} from '@/lib/services/tournament-service';
import { 
  getAllPayments, 
  verifyPayment, 
  rejectPayment 
} from '@/lib/services/payment-service';
import { 
  getMatchesByTournament, 
  generateSingleEliminationFixtures, 
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
  createAnnouncement 
} from '@/lib/services/announcement-service';
import { 
  getAuditLogs 
} from '@/lib/services/audit-service';
import { getStore, persistStore } from '@/lib/services/store';
import { StatusBadge } from '@/components/status-badge';
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
  Bell, 
  AlertCircle, 
  Flame, 
  LogOut, 
  Sliders, 
  Copy, 
  Check, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  MapPin
} from 'lucide-react';

const ADMIN_PASSKEY = 'vyrox2026admin';
const ADMIN_SESSION_KEY = 'vyrox_admin_authorized_token';

export default function SecureAdminPortalPage() {
  // Authorization Gate
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPasskey, setInputPasskey] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<
    'overview' | 'payments' | 'tournaments' | 'fixtures' | 'scoring' | 'players' | 'announcements' | 'audit'
  >('overview');

  // Datasets
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  // Selected filters
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('submitted');
  const [playerSearch, setPlayerSearch] = useState('');

  // Modals & Action States
  const [rejectPaymentModal, setRejectPaymentModal] = useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [releaseRoomModal, setReleaseRoomModal] = useState<Tournament | null>(null);
  const [customRoomId, setCustomRoomId] = useState('');
  const [customRoomPass, setCustomRoomPass] = useState('');

  // Custom Match / Fixture Builder State (Create on organizer terms!)
  const [customMatchModal, setCustomMatchModal] = useState(false);
  const [cmRoundLabel, setCmRoundLabel] = useState('Match 1 (Erangel)');
  const [cmMap, setCmMap] = useState('Erangel');
  const [cmFormat, setCmFormat] = useState('Battle Royale');
  const [cmRoomId, setCmRoomId] = useState('');
  const [cmRoomPass, setCmRoomPass] = useState('');
  const [cmTime, setCmTime] = useState('');

  // Match Scoring State
  const [scoreMatchModal, setScoreMatchModal] = useState<Match | null>(null);
  const [matchScores, setMatchScores] = useState<
    Array<{ registrationId: string; kills: number; points: number; isWinner: boolean; placement?: number }>
  >([]);

  // Player Ban Modal
  const [banPlayerModal, setBanPlayerModal] = useState<Profile | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('');

  // New Tournament Creator (Extensive on Organizer Terms)
  const [createTournamentOpen, setCreateTournamentOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newMode, setNewMode] = useState<TournamentMode>('Squad');
  const [newFormat, setNewFormat] = useState<TournamentFormat>('Battle Royale');
  const [newTeamSize, setNewTeamSize] = useState('4');
  const [newMaxSlots, setNewMaxSlots] = useState('25');
  const [newEntryFeeInr, setNewEntryFeeInr] = useState('100');
  const [newPrizePoolInr, setNewPrizePoolInr] = useState('5000');
  const [newMapPreference, setNewMapPreference] = useState('Erangel & Miramar');
  const [newRules, setNewRules] = useState(
    '1. Emulator, iPad, and 3rd party triggers are strictly banned.\n2. In-game name and UID must match registered records.\n3. POV recording mandatory for top 3 teams.\n4. Toxic language or abuse will trigger an immediate ban.'
  );

  // Announcement State
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annCategory, setAnnCategory] = useState<'general' | 'tournament' | 'urgent' | 'winner'>('urgent');

  // Check existing session on load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const session = sessionStorage.getItem(ADMIN_SESSION_KEY);
      if (session === 'authorized') {
        setIsAuthenticated(true);
      }
    }
  }, []);

  const loadAllData = async () => {
    const store = getStore();
    const tList = await getTournaments();
    setTournaments(tList);
    if (!selectedTournamentId && tList.length > 0) {
      setSelectedTournamentId(tList[0].id);
    }
    const pList = await getAllPayments();
    setPayments(pList);
    setRegistrations(store.registrations);
    setMatches(store.matches);
    const profs = await getAllProfiles();
    setPlayers(profs);
    const logs = await getAuditLogs();
    setAuditLogs(logs);
  };

  useEffect(() => {
    if (isAuthenticated) {
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
  }, [isAuthenticated]);

  // Handle Passkey verification
  const handlePasskeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPasskey.trim() === ADMIN_PASSKEY) {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ADMIN_SESSION_KEY, 'authorized');
      }
      setAuthError(null);
    } else {
      setAuthError('Invalid Security Passkey. Access restricted to authorized tournament organizers.');
    }
  };

  const handleAdminLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }
  };

  // Payment Actions
  const handleApprovePayment = async (paymentId: string) => {
    await verifyPayment(paymentId, 'p-admin-01');
    await loadAllData();
  };

  const handleRejectPayment = async () => {
    if (!rejectPaymentModal || !rejectReason.trim()) return;
    await rejectPayment(rejectPaymentModal.id, rejectReason.trim(), 'p-admin-01');
    setRejectPaymentModal(null);
    setRejectReason('');
    await loadAllData();
  };

  // Tournament Actions
  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    const feePaise = Math.round(parseFloat(newEntryFeeInr || '0') * 100);
    const prizePaise = Math.round(parseFloat(newPrizePoolInr || '0') * 100);

    await createTournament({
      title: newTitle.trim(),
      slug: newSlug.trim() || newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: `Official ${newMode} tournament on ${newMapPreference}. Format: ${newFormat}.`,
      game: 'BGMI',
      mode: newMode,
      team_size: parseInt(newTeamSize, 10),
      tournament_format: newFormat,
      entry_fee_paise: feePaise,
      prize_pool_paise: prizePaise,
      prize_distribution: [
        { place: '1st', amount: Math.round(prizePaise * 0.5 / 100) },
        { place: '2nd', amount: Math.round(prizePaise * 0.3 / 100) },
        { place: '3rd', amount: Math.round(prizePaise * 0.2 / 100) },
      ],
      max_slots: parseInt(newMaxSlots, 10),
      registration_opens_at: new Date().toISOString(),
      registration_closes_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      start_time: new Date(Date.now() + 4 * 86400000).toISOString(),
      rules: newRules,
      status: 'open',
      room_release_policy: '15_min_before',
      room_released: false,
    }, 'p-admin-01');

    setCreateTournamentOpen(false);
    setNewTitle('');
    setNewSlug('');
    await loadAllData();
  };

  // Release / Update Room Credentials
  const handleSaveRoomCredentials = async () => {
    if (!releaseRoomModal) return;
    await releaseRoomDetails(releaseRoomModal.id, customRoomId.trim(), customRoomPass.trim(), 'p-admin-01');
    setReleaseRoomModal(null);
    setCustomRoomId('');
    setCustomRoomPass('');
    await loadAllData();
  };

  // Fixture Generators
  const handleGenerateStandardFixtures = async () => {
    if (!selectedTournamentId) return;
    const t = tournaments.find(x => x.id === selectedTournamentId);
    if (!t) return;

    if (t.tournament_format === 'Single Elimination') {
      await generateSingleEliminationFixtures(selectedTournamentId, 'p-admin-01');
    } else {
      await generateBattleRoyaleLobby(selectedTournamentId, 'Custom Match 1 (Erangel)', 'p-admin-01');
    }
    await loadAllData();
  };

  // Custom Match Creation on Organizer Terms
  const handleCreateCustomMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournamentId) return;

    await createCustomMatch({
      tournamentId: selectedTournamentId,
      roundLabel: `${cmRoundLabel} [${cmMap}]`,
      format: cmFormat,
      scheduledTime: cmTime || new Date(Date.now() + 2 * 3600000).toISOString(),
      roomId: cmRoomId.trim(),
      roomPassword: cmRoomPass.trim(),
      adminId: 'p-admin-01',
    });

    setCustomMatchModal(false);
    setCmRoomId('');
    setCmRoomPass('');
    await loadAllData();
  };

  // Finalize Results
  const handleFinalizeResults = async () => {
    if (!scoreMatchModal) return;
    await recordMatchResults(scoreMatchModal.id, matchScores, 'p-admin-01');
    setScoreMatchModal(null);
    await loadAllData();
  };

  // Bans
  const handleConfirmBan = async () => {
    if (!banPlayerModal || !banReasonInput.trim()) return;
    await banUser(banPlayerModal.id, banReasonInput.trim(), 'p-admin-01');
    setBanPlayerModal(null);
    setBanReasonInput('');
    await loadAllData();
  };

  const handleLiftBan = async (playerId: string) => {
    await unbanUser(playerId, 'p-admin-01');
    await loadAllData();
  };

  // Announcements
  const handleBroadcastAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAnnouncement({
      title: annTitle.trim(),
      content: annContent.trim(),
      category: annCategory,
      is_pinned: true,
      tournament_id: selectedTournamentId || undefined,
    }, 'p-admin-01');
    setAnnTitle('');
    setAnnContent('');
    alert('Announcement broadcasted across player hubs!');
    await loadAllData();
  };

  // CSV Export
  const handleExportRegistrationsCsv = () => {
    const list = registrations.filter(r => !selectedTournamentId || r.tournament_id === selectedTournamentId);
    let csv = 'RegistrationCode,TournamentTitle,TeamName,CaptainIGN,CaptainUID,Status,SlotNumber,CreatedAt\n';
    list.forEach(r => {
      const t = tournaments.find(x => x.id === r.tournament_id);
      const cap = players.find(x => x.id === r.captain_id);
      csv += `"${r.registration_code}","${t?.title || ''}","${r.team_name || ''}","${cap?.bgmi_ign || ''}","${cap?.bgmi_uid || ''}","${r.status}",${r.slot_number || 0},"${r.created_at}"\n`;
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
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface-100 border border-surface-border rounded-3xl p-8 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400 mb-2 shadow-glow-sm">
              <Shield className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-display font-black text-white uppercase tracking-wider">
              VYROX Organizer Command
            </h1>
            <p className="text-xs font-mono text-gray-400">
              Restricted Access • Tournament Administration Portal
            </p>
          </div>

          {authError && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handlePasskeySubmit} className="space-y-4 font-mono text-xs">
            <div>
              <label className="block uppercase text-gray-400 mb-1.5 font-bold">
                Organizer Security Passkey
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={inputPasskey}
                  onChange={(e) => setInputPasskey(e.target.value)}
                  placeholder="Enter Passkey (Hint: vyrox2026admin)"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs uppercase tracking-wider shadow-glow-sm transition-all flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              <span>Authenticate & Enter Portal</span>
            </button>
          </form>

          <div className="pt-2 border-t border-surface-border text-center">
            <Link href="/" className="text-xs font-mono text-gray-500 hover:text-gray-300">
              ← Return to Public Arena
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active counts
  const pendingCount = payments.filter(p => p.payment_status === 'submitted').length;
  const currentTourney = tournaments.find(t => t.id === selectedTournamentId) || tournaments[0];
  const tourneyConfirmedRegs = registrations.filter(
    r => r.tournament_id === currentTourney?.id && r.status === 'confirmed'
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
                Indian Esports BGMI Tournament Administration
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
            onClick={() => setActiveTab('tournaments')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'tournaments' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Tournament Studio</span>
          </button>

          <button
            onClick={() => setActiveTab('fixtures')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'fixtures' ? 'border-cyanAccent-500 text-cyanAccent-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Swords className="w-4 h-4" />
            <span>Fixture Studio & Rooms</span>
          </button>

          <button
            onClick={() => setActiveTab('scoring')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'scoring' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Standings & Scoring</span>
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
            onClick={() => setActiveTab('announcements')}
            className={`pb-3 font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'announcements' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Announcements</span>
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

        {/* 5. TAB: TOURNAMENT STUDIO (Extensive Creation on Organizer Terms) */}
        {activeTab === 'tournaments' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-bold text-white text-xl">Tournament Management</h3>
                <p className="text-xs font-mono text-gray-400 mt-0.5">
                  Configure slots, qualification criteria, prize pools, and release room credentials.
                </p>
              </div>

              <button
                onClick={() => setCreateTournamentOpen(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 text-white font-bold text-xs uppercase flex items-center gap-2 shadow-glow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Custom Game</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {tournaments.map((t) => (
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
                    </div>
                    <StatusBadge status={t.status} size="sm" />
                  </div>

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
                        onChange={async (e) => {
                          await updateTournamentStatus(t.id, e.target.value as any, undefined, 'p-admin-01');
                          await loadAllData();
                        }}
                        className="px-2.5 py-1 rounded bg-surface-200 border border-surface-border text-white text-xs"
                      >
                        <option value="draft">Draft</option>
                        <option value="open">Open</option>
                        <option value="live">Live</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setReleaseRoomModal(t);
                          setCustomRoomId(t.room_id || '');
                          setCustomRoomPass(t.room_password || '');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-surface-200 hover:bg-surface-50 border border-surface-border text-cyanAccent-400 flex items-center gap-1.5 font-bold"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>Set Room & Pass</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. TAB: FIXTURE STUDIO & ROOMS */}
        {activeTab === 'fixtures' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono uppercase text-gray-400 font-bold">Select Competition:</span>
                  <select
                    value={selectedTournamentId}
                    onChange={(e) => setSelectedTournamentId(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white text-xs font-mono"
                  >
                    {tournaments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.mode} • {t.tournament_format})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateStandardFixtures}
                    className="px-3.5 py-2 rounded-xl bg-surface-200 hover:bg-surface-50 border border-surface-border text-white font-mono text-xs flex items-center gap-1.5"
                  >
                    <Swords className="w-3.5 h-3.5 text-cyanAccent-400" />
                    <span>Auto-Generate from Confirmed ({tourneyConfirmedRegs.length} Squads)</span>
                  </button>

                  <button
                    onClick={() => setCustomMatchModal(true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-mono font-bold text-xs uppercase flex items-center gap-1.5 shadow-glow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Build Custom Lobby / Round</span>
                  </button>
                </div>
              </div>

              {/* Tournament Confirmed Squads preview */}
              <div className="p-4 rounded-2xl bg-surface-200/50 border border-surface-border space-y-2">
                <div className="text-xs font-mono text-gray-400 uppercase font-bold flex items-center justify-between">
                  <span>Eligible Confirmed Squads for this Tournament ({tourneyConfirmedRegs.length}):</span>
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

            {/* Fixture Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matches
                .filter(m => !selectedTournamentId || m.tournament_id === selectedTournamentId)
                .map((m) => (
                  <div key={m.id} className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
                    <div className="flex items-center justify-between border-b border-surface-border pb-3">
                      <div>
                        <h4 className="font-display font-bold text-white text-base">{m.round_label}</h4>
                        <div className="text-xs font-mono text-cyanAccent-400">Format: {m.format}</div>
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
                        onClick={async () => {
                          const newId = prompt('Enter BGMI Room ID for this match:', m.room_id || '981726');
                          const newPass = prompt('Enter BGMI Room Password:', m.room_password || 'VYROX99');
                          if (newId && newPass) {
                            await releaseMatchRoomCredentials(m.id, newId, newPass, 'p-admin-01');
                            await loadAllData();
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-surface-100 border border-surface-border text-xs text-cyanAccent-400 hover:text-white"
                      >
                        Edit Credentials
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
                        onClick={() => {
                          setScoreMatchModal(m);
                          setMatchScores(
                            (m.participants || []).map(p => ({
                              registrationId: p.registration_id,
                              kills: p.kills,
                              points: p.points,
                              isWinner: p.is_winner,
                              placement: p.placement || 1,
                            }))
                          );
                        }}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyanAccent-600 text-white font-mono font-bold text-xs uppercase"
                      >
                        Enter Placements & Kills
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 7. TAB: STANDINGS & SCORING */}
        {activeTab === 'scoring' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
              <h3 className="font-display font-bold text-white text-lg">
                Tournament Standings & Qualification Engine
              </h3>
              <p className="text-xs font-mono text-gray-400">
                Matches marked as completed automatically calculate placement points and update national player ratings.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {matches
                  .filter(m => m.status === 'completed')
                  .map((m) => (
                    <div key={m.id} className="p-5 rounded-2xl bg-surface-200 border border-surface-border space-y-3 font-mono text-xs">
                      <div className="flex items-center justify-between border-b border-surface-border pb-2">
                        <span className="font-bold text-white">{m.round_label}</span>
                        <span className="text-emerald-400 font-bold">SCORED & FINALIZED</span>
                      </div>
                      <div className="space-y-1">
                        {m.participants?.map((p, idx) => (
                          <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-surface-100">
                            <span>#{p.placement || idx + 1} {p.registration?.team_name}</span>
                            <span className="font-bold text-amber-300">{p.points} PTS ({p.kills} Kills)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* 8. TAB: PLAYERS & ANTI-CHEAT BANS */}
        {activeTab === 'players' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search player database by BGMI IGN, UID, or username..."
                className="w-full px-4 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-xs font-mono focus:outline-none"
              />
            </div>

            <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm font-mono">
                  <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400">
                    <tr>
                      <th className="py-3 px-4">Player</th>
                      <th className="py-3 px-4">BGMI Identity</th>
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
                          (p.bgmi_ign && p.bgmi_ign.toLowerCase().includes(q))
                        );
                      })
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-surface-50/50">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">{p.display_name}</div>
                            <div className="text-gray-400 text-[11px]">@{p.username}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-cyanAccent-400 font-bold">{p.bgmi_ign || 'N/A'}</div>
                            <div className="text-gray-400 text-[11px]">UID: {p.bgmi_uid || 'N/A'}</div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-brand-400">
                            {p.current_rating} PTS
                          </td>
                          <td className="py-3 px-4 text-center">
                            <StatusBadge status={p.account_status} size="sm" />
                          </td>
                          <td className="py-3 px-4 text-right">
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
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 9. TAB: ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <div className="max-w-2xl bg-surface-100 border border-surface-border rounded-3xl p-6 space-y-4">
            <h3 className="font-display font-bold text-white text-lg">Broadcast Player Hub Notice</h3>
            <form onSubmit={handleBroadcastAnnouncement} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-gray-400 uppercase mb-1">Headline</label>
                <input
                  type="text"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="e.g. Schedule Update or Room Credentials Announcement"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>
              <div>
                <label className="block text-gray-400 uppercase mb-1">Notice Content</label>
                <textarea
                  value={annContent}
                  onChange={(e) => setAnnContent(e.target.value)}
                  rows={4}
                  required
                  placeholder="Enter details..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold uppercase tracking-wider"
                >
                  Broadcast Notice
                </button>
              </div>
            </form>
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
            <h3 className="font-display font-bold text-white text-base">Release BGMI Custom Room Credentials</h3>
            <p className="text-xs text-gray-400 font-mono">
              These credentials will immediately unlock on confirmed player dashboards for {releaseRoomModal.title}.
            </p>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">BGMI Room ID</label>
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
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReleaseRoomModal(null)}
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

      {/* MODAL: Custom Match Builder on Organizer Terms */}
      {customMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-3xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-bold text-white text-lg">Build Custom Lobby / Round</h3>
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
                  <label className="block text-gray-400 uppercase mb-1">Map Selection</label>
                  <select
                    value={cmMap}
                    onChange={(e) => setCmMap(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="Erangel">Erangel (Classic)</option>
                    <option value="Miramar">Miramar (Desert)</option>
                    <option value="Sanhok">Sanhok (Jungle)</option>
                    <option value="Vikendi">Vikendi (Snow)</option>
                    <option value="Warehouse TDM">Warehouse TDM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 uppercase mb-1">Format</label>
                  <select
                    value={cmFormat}
                    onChange={(e) => setCmFormat(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="Battle Royale">Battle Royale</option>
                    <option value="Single Elimination">Single Elimination (1v1/TDM)</option>
                  </select>
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
                Will automatically assign all {tourneyConfirmedRegs.length} confirmed squads to numbered lobby slots.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCustomMatchModal(false)}
                  className="px-4 py-2 rounded-lg bg-surface-200 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold uppercase"
                >
                  Create & Schedule Match
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
            <h3 className="font-display font-bold text-white text-base">
              Score Match: {scoreMatchModal.round_label}
            </h3>
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
                        <span>Winner (WWCD)</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-gray-400">Placement:</span>
                        <input
                          type="number"
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
                        <span className="text-[10px] text-gray-400">Kills:</span>
                        <input
                          type="number"
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
                        <span className="text-[10px] text-gray-400">Points:</span>
                        <input
                          type="number"
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
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setScoreMatchModal(null)}
                className="px-4 py-2 rounded-lg bg-surface-200 text-xs font-mono text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalizeResults}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs uppercase"
              >
                Finalize & Update Ratings
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
          <div className="bg-surface-100 border border-surface-border rounded-3xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-bold text-white text-lg">Build Tournament On Your Terms</h3>
            <form onSubmit={handleCreateTournament} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-gray-400 uppercase mb-1">Tournament Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                  }}
                  required
                  placeholder="e.g. BGMI Pro Squad League Season 1"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <div>
                <label className="block text-gray-400 uppercase mb-1">Unique Slug</label>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Team Mode</label>
                  <select
                    value={newMode}
                    onChange={(e) => {
                      const m = e.target.value as TournamentMode;
                      setNewMode(m);
                      setNewTeamSize(m === 'Squad' ? '4' : m === 'Duo' ? '2' : '1');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="Squad">Squad (4v4)</option>
                    <option value="1v1">1v1 Arena</option>
                    <option value="Solo">Solo</option>
                    <option value="Duo">Duo (2v2)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Tournament Format</label>
                  <select
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value as TournamentFormat)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="Battle Royale">Battle Royale Custom Lobbies</option>
                    <option value="Single Elimination">Single Elimination Knockout</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Entry Fee (₹)</label>
                  <input
                    type="number"
                    value={newEntryFeeInr}
                    onChange={(e) => setNewEntryFeeInr(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Prize Pool (₹)</label>
                  <input
                    type="number"
                    value={newPrizePoolInr}
                    onChange={(e) => setNewPrizePoolInr(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Max Teams / Slots</label>
                  <input
                    type="number"
                    value={newMaxSlots}
                    onChange={(e) => setNewMaxSlots(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 uppercase mb-1">Map & Qualification Preference</label>
                <input
                  type="text"
                  value={newMapPreference}
                  onChange={(e) => setNewMapPreference(e.target.value)}
                  placeholder="e.g. Erangel, Miramar • Top 8 teams advance to Grand Finals"
                  className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <div>
                <label className="block text-gray-400 uppercase mb-1">Rules & Anti-Cheat</label>
                <textarea
                  value={newRules}
                  onChange={(e) => setNewRules(e.target.value)}
                  rows={3}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateTournamentOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-200 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold"
                >
                  Publish Tournament
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
