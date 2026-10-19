'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { 
  Tournament, 
  Registration, 
  Payment, 
  Match, 
  Profile, 
  AdminAuditLog, 
  Announcement 
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
import { getStore } from '@/lib/services/store';
import { StatusBadge } from '@/components/status-badge';
import { 
  Shield, 
  CreditCard, 
  Users, 
  Trophy, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Download, 
  Swords, 
  Key, 
  FileText, 
  Bell, 
  AlertCircle,
  Eye,
  Lock,
  Unlock
} from 'lucide-react';

export default function AdminDashboardPage() {
  const { currentUser, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'payments' | 'tournaments' | 'registrations' | 'fixtures' | 'players' | 'announcements' | 'audit'>('payments');

  // Datasets
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  // Filter states
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('submitted');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');

  // Modal / Action states
  const [rejectModalPayment, setRejectModalPayment] = useState<Payment | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [createTourneyOpen, setCreateTourneyOpen] = useState(false);
  const [releaseRoomTourney, setReleaseRoomTourney] = useState<Tournament | null>(null);
  const [inputRoomId, setInputRoomId] = useState('');
  const [inputRoomPass, setInputRoomPass] = useState('');

  // Fixture / Match Scoring State
  const [scoreMatchModal, setScoreMatchModal] = useState<Match | null>(null);
  const [matchScores, setMatchScores] = useState<Array<{ registrationId: string; kills: number; points: number; isWinner: boolean; placement?: number }>>([]);

  // Ban State
  const [banModalPlayer, setBanModalPlayer] = useState<Profile | null>(null);
  const [banReason, setBanReason] = useState('');

  // New Tournament Form
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMode, setNewMode] = useState<'Solo' | '1v1' | 'Squad'>('Squad');
  const [newFormat, setNewFormat] = useState<'Battle Royale' | 'Single Elimination'>('Battle Royale');
  const [newFeeInr, setNewFeeInr] = useState('100');
  const [newPrizeInr, setNewPrizeInr] = useState('5000');
  const [newSlots, setNewSlots] = useState('25');
  const [newRules, setNewRules] = useState('Fair play mandatory. Emulators & iPads strictly banned.');

  // Announcement Form
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annCategory, setAnnCategory] = useState<'general' | 'tournament' | 'urgent'>('general');

  const loadAll = async () => {
    const store = getStore();
    const tList = await getTournaments();
    setTournaments(tList);
    if (!selectedTournamentId && tList.length > 0) {
      setSelectedTournamentId(tList[0].id);
    }
    const payList = await getAllPayments();
    setPayments(payList);
    setRegistrations(store.registrations);
    const mList = store.matches;
    setMatches(mList);
    const pList = await getAllProfiles();
    setPlayers(pList);
    const logs = await getAuditLogs();
    setAuditLogs(logs);
  };

  useEffect(() => {
    loadAll();
  }, []);

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-display font-bold text-white">Administrator Access Required</h2>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          You do not have organizer privileges. Use the &ldquo;Switch Persona&rdquo; button in the top navigation bar to switch to the VYROX Admin persona for evaluation.
        </p>
      </div>
    );
  }

  // Payments verification actions
  const handleApprovePayment = async (paymentId: string) => {
    if (!currentUser) return;
    await verifyPayment(paymentId, currentUser.id);
    await loadAll();
  };

  const handleRejectPayment = async () => {
    if (!currentUser || !rejectModalPayment || !rejectionReason.trim()) return;
    await rejectPayment(rejectModalPayment.id, rejectionReason.trim(), currentUser.id);
    setRejectModalPayment(null);
    setRejectionReason('');
    await loadAll();
  };

  // Tournament Create
  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    await createTournament({
      title: newTitle.trim(),
      slug: newSlug.trim() || newTitle.toLowerCase().replace(/\s+/g, '-'),
      description: newDesc.trim(),
      game: 'BGMI',
      mode: newMode,
      team_size: newMode === 'Squad' ? 4 : 1,
      tournament_format: newFormat,
      entry_fee_paise: Math.round(parseFloat(newFeeInr || '0') * 100),
      prize_pool_paise: Math.round(parseFloat(newPrizeInr || '0') * 100),
      max_slots: parseInt(newSlots || '25', 10),
      registration_opens_at: new Date().toISOString(),
      registration_closes_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      start_time: new Date(Date.now() + 4 * 86400000).toISOString(),
      rules: newRules,
      status: 'open',
      room_release_policy: '15_min_before',
      room_released: false,
    }, currentUser.id);

    setCreateTourneyOpen(false);
    await loadAll();
  };

  // Release Room details
  const handleReleaseRoom = async () => {
    if (!currentUser || !releaseRoomTourney) return;
    await releaseRoomDetails(releaseRoomTourney.id, inputRoomId.trim(), inputRoomPass.trim(), currentUser.id);
    setReleaseRoomTourney(null);
    setInputRoomId('');
    setInputRoomPass('');
    await loadAll();
  };

  // Generate Fixtures
  const handleGenerateFixtures = async () => {
    if (!currentUser || !selectedTournamentId) return;
    const t = tournaments.find(x => x.id === selectedTournamentId);
    if (!t) return;

    if (t.tournament_format === 'Single Elimination') {
      await generateSingleEliminationFixtures(selectedTournamentId, currentUser.id);
    } else {
      await generateBattleRoyaleLobby(selectedTournamentId, 'Custom Match 1 (Erangel)', currentUser.id);
    }
    await loadAll();
  };

  // Finalize Match Results
  const handleFinalizeMatchResults = async () => {
    if (!currentUser || !scoreMatchModal) return;
    await recordMatchResults(scoreMatchModal.id, matchScores, currentUser.id);
    setScoreMatchModal(null);
    await loadAll();
  };

  // Ban Player
  const handleBanPlayer = async () => {
    if (!currentUser || !banModalPlayer || !banReason.trim()) return;
    await banUser(banModalPlayer.id, banReason.trim(), currentUser.id);
    setBanModalPlayer(null);
    setBanReason('');
    await loadAll();
  };

  const handleUnbanPlayer = async (playerId: string) => {
    if (!currentUser) return;
    await unbanUser(playerId, currentUser.id);
    await loadAll();
  };

  // Publish Announcement
  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    await createAnnouncement({
      title: annTitle.trim(),
      content: annContent.trim(),
      category: annCategory,
      is_pinned: true,
      tournament_id: selectedTournamentId || undefined,
    }, currentUser.id);
    setAnnTitle('');
    setAnnContent('');
    alert('Announcement published to players!');
    await loadAll();
  };

  // Export CSV
  const handleExportCsv = () => {
    const activeRegs = registrations.filter(r => !selectedTournamentId || r.tournament_id === selectedTournamentId);
    let csv = 'RegistrationCode,Tournament,TeamName,CaptainIGN,CaptainUID,Status,SlotNumber,CreatedAt\n';
    activeRegs.forEach(r => {
      const t = tournaments.find(x => x.id === r.tournament_id);
      const cap = players.find(x => x.id === r.captain_id);
      csv += `"${r.registration_code}","${t?.title || ''}","${r.team_name || ''}","${cap?.bgmi_ign || ''}","${cap?.bgmi_uid || ''}","${r.status}",${r.slot_number || 0},"${r.created_at}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vyrox-registrations-${Date.now()}.csv`;
    a.click();
  };

  const pendingPaymentsCount = payments.filter(p => p.payment_status === 'submitted').length;
  const activeTournamentsCount = tournaments.filter(t => ['open', 'live'].includes(t.status)).length;
  const filteredPayments = payments.filter(p => paymentFilter === 'all' || p.payment_status === paymentFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. ADMIN HEADER & METRICS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-surface-border pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-xs font-mono text-rose-400 mb-2">
            <Shield className="w-3.5 h-3.5" />
            <span>ORGANIZER COMMAND CENTER</span>
          </div>
          <h1 className="text-3xl font-display font-black text-white uppercase tracking-tight">
            VYROX Tournament Admin
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Verify manual UPI transactions, create tournaments, release lobby room passwords, generate brackets, and log match results.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-100 hover:bg-surface-50 border border-surface-border text-xs font-mono text-cyanAccent-400 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Export Registrations (CSV)</span>
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-surface-100 border border-surface-border">
          <div className="text-[10px] font-mono uppercase text-gray-400">Total Players</div>
          <div className="text-2xl font-black font-mono text-white mt-1">{players.length}</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-100 border border-surface-border">
          <div className="text-[10px] font-mono uppercase text-gray-400">Active Tourneys</div>
          <div className="text-2xl font-black font-mono text-brand-400 mt-1">{activeTournamentsCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-100 border border-surface-border">
          <div className="text-[10px] font-mono uppercase text-gray-400">Total Registrations</div>
          <div className="text-2xl font-black font-mono text-cyanAccent-400 mt-1">{registrations.length}</div>
        </div>

        <div className={`p-4 rounded-xl border ${pendingPaymentsCount > 0 ? 'bg-amber-950/30 border-amber-500/40' : 'bg-surface-100 border-surface-border'}`}>
          <div className="text-[10px] font-mono uppercase text-amber-400 font-bold">UPI Verifications</div>
          <div className="text-2xl font-black font-mono text-amber-300 mt-1">{pendingPaymentsCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-100 border border-surface-border">
          <div className="text-[10px] font-mono uppercase text-gray-400">Fixtures Scheduled</div>
          <div className="text-2xl font-black font-mono text-white mt-1">{matches.length}</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-100 border border-surface-border">
          <div className="text-[10px] font-mono uppercase text-gray-400">Audit Logs</div>
          <div className="text-2xl font-black font-mono text-gray-300 mt-1">{auditLogs.length}</div>
        </div>
      </div>

      {/* 2. ADMIN TABS */}
      <div className="flex border-b border-surface-border space-x-6 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('payments')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'payments'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payment Approvals ({pendingPaymentsCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('tournaments')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'tournaments'
              ? 'border-brand-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Manage Tournaments</span>
        </button>

        <button
          onClick={() => setActiveTab('fixtures')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'fixtures'
              ? 'border-cyanAccent-500 text-cyanAccent-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Swords className="w-4 h-4" />
          <span>Fixtures & Scoring</span>
        </button>

        <button
          onClick={() => setActiveTab('players')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'players'
              ? 'border-rose-500 text-rose-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Players & Bans</span>
        </button>

        <button
          onClick={() => setActiveTab('announcements')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'announcements'
              ? 'border-brand-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Announcements</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-brand-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Logs</span>
        </button>
      </div>

      {/* 3. TAB 1: PAYMENT APPROVALS */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs font-mono text-gray-400">
              Filter by status:
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value as 'all' | 'submitted' | 'verified' | 'rejected')}
                className="ml-2 px-2.5 py-1 rounded bg-surface-100 border border-surface-border text-white text-xs"
              >
                <option value="submitted">Submitted (Awaiting Approval)</option>
                <option value="verified">Approved & Confirmed</option>
                <option value="rejected">Rejected</option>
                <option value="all">All Submissions</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm font-mono">
                <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400">
                  <tr>
                    <th className="py-3 px-4">Event & Squad</th>
                    <th className="py-3 px-4">Submitted UTR / Ref</th>
                    <th className="py-3 px-4 text-center">Amount Due</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Verification Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border text-xs">
                  {filteredPayments.map((p) => {
                    const reg = p.registration;
                    const amountInr = p.amount_paise / 100;

                    return (
                      <tr key={p.id} className="hover:bg-surface-50/50">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{reg?.tournament?.title || 'Tournament'}</div>
                          <div className="text-cyanAccent-400 text-[11px]">
                            {reg?.team_name} • Code: {reg?.registration_code}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white select-all">{p.transaction_reference}</div>
                          <div className="text-gray-500 text-[10px]">
                            Submitted: {new Date(p.submitted_at).toLocaleTimeString('en-IN')}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                          ₹{amountInr}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <StatusBadge status={p.payment_status} size="sm" />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {p.payment_status === 'submitted' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleApprovePayment(p.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase shadow-sm transition-colors flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => {
                                  setRejectModalPayment(p);
                                  setRejectionReason('Invalid or unmatched UTR transaction reference.');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-red-950 hover:bg-red-900 border border-red-500/30 text-red-300 font-bold text-xs uppercase transition-colors flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-500 text-[11px]">
                              {p.payment_status === 'verified' ? 'Verified by Admin' : `Rejected: ${p.rejection_reason || ''}`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPayments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No payments found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: MANAGE TOURNAMENTS */}
      {activeTab === 'tournaments' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-display font-bold text-white text-lg">Platform Tournaments</h3>
            <button
              onClick={() => setCreateTourneyOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold text-xs uppercase flex items-center gap-1.5 shadow-glow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Tournament</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tournaments.map((t) => (
              <div key={t.id} className="p-5 rounded-2xl bg-surface-100 border border-surface-border space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-display font-bold text-white text-base">{t.title}</h4>
                    <span className="text-xs font-mono text-cyanAccent-400">
                      {t.mode} • {t.tournament_format} • Slots: {t.registered_count || 0}/{t.max_slots}
                    </span>
                  </div>
                  <StatusBadge status={t.status} size="sm" />
                </div>

                {/* Status and Room release controls */}
                <div className="pt-3 border-t border-surface-border flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Status:</span>
                    <select
                      value={t.status}
                      onChange={async (e) => {
                        if (!currentUser) return;
                        await updateTournamentStatus(t.id, e.target.value as any, undefined, currentUser.id);
                        await loadAll();
                      }}
                      className="px-2 py-1 rounded bg-surface-200 border border-surface-border text-white text-xs"
                    >
                      <option value="draft">Draft</option>
                      <option value="open">Open</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      setReleaseRoomTourney(t);
                      setInputRoomId(t.room_id || '');
                      setInputRoomPass(t.room_password || '');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-surface-200 hover:bg-surface-50 border border-surface-border text-cyanAccent-400 flex items-center gap-1.5"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>{t.room_released ? 'Update Room ID' : 'Release Room'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. TAB 3: FIXTURES & SCORING */}
      {activeTab === 'fixtures' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface-100 border border-surface-border">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-gray-400 uppercase">Select Event:</span>
              <select
                value={selectedTournamentId}
                onChange={(e) => setSelectedTournamentId(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-surface-200 border border-surface-border text-white text-xs font-mono"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.tournament_format})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerateFixtures}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 text-white font-bold text-xs uppercase flex items-center gap-1.5 shadow-glow-sm"
            >
              <Swords className="w-4 h-4" />
              <span>Generate / Refresh Fixtures</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches
              .filter(m => !selectedTournamentId || m.tournament_id === selectedTournamentId)
              .map((m) => (
                <div key={m.id} className="p-5 rounded-2xl bg-surface-100 border border-surface-border space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-display font-bold text-white text-sm">{m.round_label}</h4>
                      <div className="text-[11px] font-mono text-gray-400">Format: {m.format}</div>
                    </div>
                    <StatusBadge status={m.status} size="sm" />
                  </div>

                  <div className="space-y-1.5 font-mono text-xs">
                    {m.participants?.map((p, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-surface-200 flex items-center justify-between">
                        <span className="font-semibold text-white">
                          #{p.participant_slot || idx + 1} {p.registration?.team_name || 'Squad'}
                        </span>
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
                      className="px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-mono font-bold"
                    >
                      Enter Match Results
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 6. TAB 4: PLAYERS & ANTI-CHEAT BANS */}
      {activeTab === 'players' && (
        <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm font-mono">
              <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400">
                <tr>
                  <th className="py-3 px-4">Player</th>
                  <th className="py-3 px-4">BGMI IGN & UID</th>
                  <th className="py-3 px-4 text-center">Rating</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Anti-Cheat Enforcement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border text-xs">
                {players.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-50/50">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{p.display_name}</div>
                      <div className="text-gray-400 text-[11px]">@{p.username}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-cyanAccent-400">{p.bgmi_ign || 'N/A'}</div>
                      <div className="text-gray-500 text-[10px]">UID: {p.bgmi_uid || 'N/A'}</div>
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
                          onClick={() => handleUnbanPlayer(p.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-xs font-bold"
                        >
                          Lift Ban
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setBanModalPlayer(p);
                            setBanReason('Detected emulator or POV audit failure.');
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
      )}

      {/* 7. TAB 5: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="max-w-2xl bg-surface-100 border border-surface-border rounded-2xl p-6 space-y-4">
          <h3 className="font-display font-bold text-white text-lg">Broadcast Announcement</h3>
          <form onSubmit={handlePublishAnnouncement} className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-gray-400 uppercase mb-1">Notice Headline</label>
              <input
                type="text"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="e.g. Schedule Update or Final Winners Announcement"
                required
                className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 uppercase mb-1">Content</label>
              <textarea
                value={annContent}
                onChange={(e) => setAnnContent(e.target.value)}
                rows={4}
                required
                placeholder="Enter detailed instructions for players..."
                className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold uppercase tracking-wider"
              >
                Broadcast to Players
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 8. TAB 6: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface-200/60 border-b border-surface-border uppercase text-gray-400">
                <tr>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Entity</th>
                  <th className="py-3 px-4">Target ID</th>
                  <th className="py-3 px-4">Metadata</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border text-gray-300">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-50/50">
                    <td className="py-2.5 px-4 font-bold text-cyanAccent-400">{log.action}</td>
                    <td className="py-2.5 px-4 text-gray-400">{log.target_entity}</td>
                    <td className="py-2.5 px-4 text-gray-300">{log.target_id}</td>
                    <td className="py-2.5 px-4 text-gray-400 font-sans text-[11px] max-w-xs truncate">
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

      {/* MODAL: Reject Payment */}
      {rejectModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-white text-base">Reject Payment Submission</h3>
            <p className="text-xs text-gray-400">
              Provide an explanation for rejecting reference <strong className="text-white">{rejectModalPayment.transaction_reference}</strong>. The player will be prompted to resubmit.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full p-3 rounded-xl bg-surface-200 border border-surface-border text-white text-xs font-mono"
              rows={3}
              placeholder="e.g. UTR not found in bank statement or mismatched amount"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectModalPayment(null)}
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

      {/* MODAL: Release Room ID & Password */}
      {releaseRoomTourney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-white text-base">Release BGMI Room Credentials</h3>
            <p className="text-xs text-gray-400">
              These credentials will immediately unlock on confirmed player dashboards.
            </p>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">BGMI Room ID</label>
              <input
                type="text"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                placeholder="e.g. 9817263"
                className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">Room Password</label>
              <input
                type="text"
                value={inputRoomPass}
                onChange={(e) => setInputRoomPass(e.target.value)}
                placeholder="e.g. VYROX_PRO"
                className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReleaseRoomTourney(null)}
                className="px-4 py-2 rounded-lg bg-surface-200 text-xs font-mono text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleReleaseRoom}
                className="px-4 py-2 rounded-lg bg-cyanAccent-600 text-white font-bold text-xs uppercase"
              >
                Release Credentials
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Score Match Results */}
      {scoreMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-2xl p-6 max-w-xl w-full space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-display font-bold text-white text-base">
              Score Match: {scoreMatchModal.round_label}
            </h3>
            <div className="space-y-3 font-mono text-xs">
              {matchScores.map((score, idx) => {
                const reg = registrations.find(r => r.id === score.registrationId);
                return (
                  <div key={idx} className="p-3 rounded-xl bg-surface-200 border border-surface-border space-y-2">
                    <div className="flex items-center justify-between font-bold text-white">
                      <span>{reg?.team_name || 'Squad'}</span>
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
                        <span>Is Winner</span>
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
                onClick={handleFinalizeMatchResults}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs uppercase"
              >
                Finalize & Update Ratings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ban Player */}
      {banModalPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-white text-base">Enforce Anti-Cheat Account Ban</h3>
            <p className="text-xs text-gray-400">
              Banning <strong className="text-white">@{banModalPlayer.username}</strong> will immediately bar them from registering for new tournaments.
            </p>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="e.g. Failure to submit required match POV recording"
              className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white text-xs font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBanModalPlayer(null)}
                className="px-4 py-2 rounded-lg bg-surface-200 text-xs font-mono text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleBanPlayer}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-xs uppercase"
              >
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create Tournament */}
      {createTourneyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-100 border border-surface-border rounded-2xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-bold text-white text-lg">Create New Tournament</h3>
            <form onSubmit={handleCreateTournament} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-gray-400 uppercase mb-1">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                  }}
                  required
                  placeholder="e.g. BGMI Squad Night Scrims"
                  className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <div>
                <label className="block text-gray-400 uppercase mb-1">Slug</label>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Mode</label>
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="Squad">Squad</option>
                    <option value="1v1">1v1</option>
                    <option value="Solo">Solo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Format</label>
                  <select
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  >
                    <option value="Battle Royale">Battle Royale</option>
                    <option value="Single Elimination">Single Elimination</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Entry Fee (₹)</label>
                  <input
                    type="number"
                    value={newFeeInr}
                    onChange={(e) => setNewFeeInr(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Prize (₹)</label>
                  <input
                    type="number"
                    value={newPrizeInr}
                    onChange={(e) => setNewPrizeInr(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 uppercase mb-1">Max Slots</label>
                  <input
                    type="number"
                    value={newSlots}
                    onChange={(e) => setNewSlots(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 uppercase mb-1">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  required
                  placeholder="Describe map, rules, qualification..."
                  className="w-full px-3 py-2 rounded-xl bg-surface-200 border border-surface-border text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateTourneyOpen(false)}
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
