'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Tournament, 
  Registration, 
  Match, 
} from '@/lib/supabase/types';
import { getTournamentBySlug } from '@/lib/services/tournament-service';
import { getTournamentRoomCredentials } from '@/lib/services/tournament-service';
import { 
  getRegistrationsByTournament,
  getUserRegistrations,
  registerForTournament 
} from '@/lib/services/registration-service';
import { getMatchesByTournament } from '@/lib/services/fixture-service';
import { useAuth } from '@/lib/auth-context';
import { isManualPaymentConfigured } from '@/lib/config/payments';
import { getPaidRegistrationEnabled } from '@/lib/services/platform-settings';
import { getTournamentBanner, isLegacyTournamentBanner } from '@/lib/utils/tournament-banner';
import { StatusBadge } from '@/components/status-badge';
import { UpiPaymentModal } from '@/components/upi-payment-modal';
import { 
  Trophy, 
  Calendar, 
  Users, 
  ShieldCheck, 
  Key, 
  Clock, 
  IndianRupee, 
  Swords, 
  AlertCircle, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  CheckCircle2,
  Share2
} from 'lucide-react';

const getBattleRoyaleLobbyDescription = (label: string) =>
  label.replace(/^Match\s*\d+\s*[-:·]?\s*/i, '').replace(/^\((.*)\)$/, '$1').trim() || 'Battle Royale lobby';

export default function TournamentDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();
  const { currentUser, isAdmin } = useAuth();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userRegistration, setUserRegistration] = useState<Registration | null>(null);
  const [roomCredentials, setRoomCredentials] = useState<{ room_id: string | null; room_password: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paidRegistrationEnabled, setPaidRegistrationEnabled] = useState(false);

  // Registration Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [ign, setIgn] = useState('');
  const [uid, setUid] = useState('');
  const [teammates, setTeammates] = useState<Array<{ ign: string; uid: string }>>([]);
  const [regError, setRegError] = useState<string | null>(null);
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);

  // UPI Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'fixtures' | 'participants' | 'rules'>('overview');

  const loadData = async () => {
    if (!slug) return;
    setIsLoading(true);
    const t = await getTournamentBySlug(slug);
    if (t) {
      setTournament(t);
      const regs = !currentUser
        ? []
        : isAdmin
          ? await getRegistrationsByTournament(t.id)
          : (await getUserRegistrations(currentUser.id)).filter((registration) => registration.tournament_id === t.id);
      setRegistrations(regs);
      const m = await getMatchesByTournament(t.id, isAdmin);
      setMatches(m);
      try {
        setPaidRegistrationEnabled(await getPaidRegistrationEnabled());
      } catch {
        setPaidRegistrationEnabled(false);
      }

      if (currentUser) {
        const userReg = regs.find(r => r.captain_id === currentUser.id);
        setUserRegistration(userReg || null);
        if (userReg?.status === 'confirmed' || isAdmin) {
          setRoomCredentials(await getTournamentRoomCredentials(t.id));
        } else {
          setRoomCredentials(null);
        }
      } else {
        setUserRegistration(null);
        setRoomCredentials(null);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [slug, currentUser, isAdmin]);

  // Pre-fill profile IGN and UID when user logs in
  useEffect(() => {
    if (currentUser) {
      const playerIgn = tournament?.game === 'Free Fire' ? currentUser.free_fire_ign : currentUser.bgmi_ign;
      const playerUid = tournament?.game === 'Free Fire' ? currentUser.free_fire_uid : currentUser.bgmi_uid;
      if (playerIgn) setIgn(playerIgn);
      if (playerUid) setUid(playerUid);
      if (tournament) {
        setTeammates(Array.from({ length: Math.max(0, tournament.team_size - 1) }, () => ({ ign: '', uid: '' })));
      }
    }
  }, [currentUser, tournament]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center font-mono text-gray-400 animate-pulse">
        Loading tournament details...
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-display font-bold text-white">Tournament Not Found</h2>
        <p className="text-gray-400 mt-2 text-sm">The tournament you requested does not exist or was removed.</p>
        <Link
          href="/tournaments"
          className="inline-block mt-4 px-4 py-2 rounded-lg bg-surface-100 border border-surface-border text-cyanAccent-400 text-xs font-mono"
        >
          Return to Directory
        </Link>
      </div>
    );
  }

  const isFree = tournament.entry_fee_paise === 0;
  const canUsePaidRegistration = isFree || (paidRegistrationEnabled && isManualPaymentConfigured());
  const bannerUrl = !tournament.banner_url || isLegacyTournamentBanner(tournament.banner_url)
    ? getTournamentBanner(tournament.game, tournament.slug, tournament.title)
    : tournament.banner_url;
  const entryFeeInr = tournament.entry_fee_paise / 100;
  const prizePoolInr = tournament.prize_pool_paise / 100;
  const isPastTournament = tournament.status === 'completed' || tournament.status === 'cancelled';
  const now = Date.now();
  const registrationHasNotOpened = now < new Date(tournament.registration_opens_at).getTime();
  const registrationWindowHasClosed = now > new Date(tournament.registration_closes_at).getTime();
  const registrationCanStart = tournament.status === 'open' && !registrationHasNotOpened && !registrationWindowHasClosed;
  const displayTournamentStatus = tournament.status === 'open' && registrationHasNotOpened
    ? 'registration_upcoming'
    : tournament.status === 'open' && registrationWindowHasClosed
      ? 'registration_closed'
      : tournament.status;

  // Format dates in Asia/Kolkata
  const formatIst = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      router.push('/auth/signin');
      return;
    }

    setRegError(null);
    if (!isFree && !canUsePaidRegistration) {
      setRegError('Paid registrations are not enabled yet. Please check back with the organizer.');
      return;
    }
    setIsSubmittingReg(true);

    try {
      const res = await registerForTournament({
        tournamentId: tournament.id,
        captainId: currentUser.id,
        teamName: teamName || ign,
        ign: ign.trim(),
        uid: uid.trim(),
        teammates: teammates.filter(t => t.ign && t.uid),
      });

      if (!res.success) {
        setRegError(res.error || 'Failed to submit registration');
      } else if (res.registration) {
        setUserRegistration(res.registration);
        setIsRegistering(false);
        await loadData();

        // If paid, immediately open UPI payment modal!
        if (!isFree && canUsePaidRegistration) {
          setPaymentModalOpen(true);
        }
      }
    } catch (err: unknown) {
      setRegError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  const isUserConfirmed = userRegistration?.status === 'confirmed';
  const showRoomDetails = (isUserConfirmed || isAdmin) && Boolean(roomCredentials?.room_id && roomCredentials.room_password);
  const fixtureMatches = tournament.tournament_format === 'Battle Royale'
    ? [...matches].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.scheduled_time.localeCompare(b.scheduled_time) || a.id.localeCompare(b.id))
    : matches;
  const fixtureMatchNumbers = new Map(fixtureMatches.map((match, index) => [
    match.id,
    tournament.tournament_format === 'Battle Royale' ? index + 1 : match.match_number,
  ] as const));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. TOURNAMENT HERO BANNER */}
      <div className="relative rounded-3xl overflow-hidden bg-surface-100 border border-surface-border">
        <div className="relative h-64 md:h-80 w-full bg-surface-200 overflow-hidden">
          {tournament.banner_url && (
            <img
              src={bannerUrl}
              alt={tournament.title}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-100 via-surface-100/70 to-transparent" />

          {/* Badges Overlay */}
          <div className="absolute top-6 left-6 flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-md text-xs font-bold font-mono uppercase bg-black/80 backdrop-blur-md text-cyanAccent-400 border border-cyanAccent-500/30">
              {tournament.game}
            </span>
            <span className="px-3 py-1 rounded-md text-xs font-bold font-mono uppercase bg-black/80 backdrop-blur-md text-white border border-white/10">
              {tournament.mode}
            </span>
            <span className="px-3 py-1 rounded-md text-xs font-bold font-mono uppercase bg-black/80 backdrop-blur-md text-brand-300 border border-brand-500/30">
              {tournament.tournament_format}
            </span>
          </div>

          <div className="absolute top-6 right-6">
            <StatusBadge status={displayTournamentStatus} />
          </div>
        </div>

        {/* Title & Key Actions */}
        <div className="px-6 md:px-10 pb-8 -mt-16 relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <h1 className="text-3xl md:text-5xl font-display font-black text-white uppercase tracking-tight">
                {tournament.title}
              </h1>
              <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">
                {tournament.description}
              </p>
            </div>

            {/* Quick Status / CTA Card */}
            <div className="flex-shrink-0 bg-surface-200/90 backdrop-blur-md border border-surface-border p-4 rounded-2xl flex flex-col gap-3 min-w-[280px]">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-gray-400">ENTRY FEE</span>
                <span className={`text-base font-bold ${isFree ? 'text-emerald-400' : 'text-white'}`}>
                  {isFree ? 'FREE ENTRY' : `₹${entryFeeInr}`}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-gray-400">TOTAL PRIZE</span>
                <span className="text-base font-bold text-amber-300">
                  ₹{prizePoolInr.toLocaleString('en-IN')}
                </span>
              </div>

              {/* Dynamic Registration CTA */}
              {userRegistration ? (
                <div className="space-y-2 pt-1 border-t border-surface-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-gray-400">YOUR REGISTRATION:</span>
                    <StatusBadge status={userRegistration.status} size="sm" />
                  </div>

                  {!isPastTournament && (userRegistration.status === 'pending_payment' || userRegistration.status === 'rejected') && (
                    canUsePaidRegistration ? (
                      <button
                        onClick={() => setPaymentModalOpen(true)}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs uppercase tracking-wider shadow-glow-sm transition-all flex items-center justify-center gap-1.5"
                      >
                        <IndianRupee className="w-3.5 h-3.5" />
                        <span>{userRegistration.status === 'rejected' ? 'Resubmit UPI Reference' : 'Submit UPI Reference'}</span>
                      </button>
                    ) : (
                      <div className="text-center text-xs text-amber-300">Paid registration is not configured yet.</div>
                    )
                  )}

                  {userRegistration.status === 'payment_submitted' && (
                    <div className="p-2.5 rounded-xl bg-violet-950/40 border border-violet-500/30 text-[11px] text-violet-300 text-center font-mono">
                      UTR submitted. Your entry will be confirmed once payment is verified.
                    </div>
                  )}

                  {userRegistration.status === 'confirmed' && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 text-center font-mono flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmed • Slot #{userRegistration.slot_number || 1}</span>
                    </div>
                  )}
                </div>
              ) : registrationCanStart && canUsePaidRegistration ? (
                <button
                  onClick={() => setIsRegistering(true)}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 hover:to-cyanAccent-500 text-white font-bold text-sm uppercase tracking-wider shadow-glow hover:shadow-glow-cyan transition-all flex items-center justify-center gap-2"
                >
                  <Swords className="w-4 h-4" />
                  <span>Join Tournament</span>
                </button>
              ) : registrationCanStart ? (
                <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-center text-xs font-mono text-amber-300">
                  Paid registration is not available yet.
                </div>
              ) : tournament.status === 'open' && registrationHasNotOpened ? (
                <div className="p-2.5 rounded-xl border border-cyanAccent-500/30 bg-cyanAccent-950/20 text-center text-xs font-mono text-cyanAccent-200">
                  Registration opens {formatIst(tournament.registration_opens_at)} IST.
                </div>
              ) : tournament.status === 'open' && registrationWindowHasClosed ? (
                <div className="p-2.5 rounded-xl border border-surface-border bg-surface-100 text-center text-xs font-mono text-gray-400">
                  Registration has closed.
                </div>
              ) : (
                <div className="text-center py-2 text-xs font-mono text-gray-400">
                  {tournament.status === 'cancelled'
                    ? 'This tournament was cancelled.'
                    : tournament.status === 'completed'
                      ? 'This tournament is complete.'
                      : 'Registration is closed.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. RESTRICTED ROOM CREDENTIALS BANNER (Security Sensitive) */}
      <div className={`p-6 rounded-2xl border ${
        showRoomDetails 
          ? 'bg-gradient-to-r from-emerald-950/40 to-surface-100 border-emerald-500/40 shadow-glow-sm' 
          : 'bg-surface-100 border-surface-border'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              showRoomDetails ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-200 text-gray-400'
            }`}>
              {showRoomDetails ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-xs font-mono uppercase text-gray-400 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyanAccent-400" />
                <span>{tournament.game} Custom Lobby Credentials</span>
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {showRoomDetails 
                  ? 'Lobby Details Released to Confirmed Participants' 
                  : 'Restricted Access — Confirmed Players Only'}
              </div>
            </div>
          </div>

          {showRoomDetails ? (
            <div className="flex flex-wrap items-center gap-4 bg-surface-200/90 p-3 rounded-xl border border-surface-border">
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400">ROOM ID:</span>
                <div className="font-mono font-bold text-white text-base select-all">{roomCredentials?.room_id}</div>
              </div>
              <div className="h-8 w-px bg-surface-border hidden sm:block" />
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400">PASSWORD:</span>
                <div className="font-mono font-bold text-cyanAccent-400 text-base select-all">{roomCredentials?.room_password}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs font-mono text-gray-400">
              {isUserConfirmed 
                ? 'Credentials will unlock 15 minutes before the match start time.' 
                : 'Confirm your squad registration to receive lobby credentials.'}
            </div>
          )}
        </div>
      </div>

      {/* 3. REGISTRATION FORM DRAWER (When active) */}
      {isRegistering && !userRegistration && (
        <div className="p-6 md:p-8 rounded-3xl bg-surface-100 border border-brand-500/40 shadow-glow relative animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-6">
            <div>
              <h3 className="font-display font-bold text-xl text-white">
                Player Registration — {tournament.title}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">
                Format: {tournament.mode} ({tournament.team_size} Players) • Entry: {isFree ? 'FREE' : `₹${entryFeeInr}`}
              </p>
            </div>
            <button
              onClick={() => setIsRegistering(false)}
              className="text-gray-400 hover:text-white text-xs font-mono"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleRegisterSubmit} className="space-y-6">
            <p className="text-[11px] text-gray-500">Faded “e.g.” text is placeholder guidance only. Enter your real team name, in-game name, and player ID.</p>
            {regError && (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{regError}</span>
              </div>
            )}

            {/* Team Name */}
            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1.5">
                Team / Squad Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. GodLike Esports"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Captain / leader identity */}
            <div className="p-4 rounded-2xl bg-surface-200/60 border border-surface-border space-y-4">
              <div className="text-xs font-mono uppercase font-bold text-brand-300">
                Captain / Leader Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                    {tournament.game} In-Game Name (IGN) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={ign}
                    onChange={(e) => setIgn(e.target.value)}
                    placeholder={tournament.game === 'BGMI' ? 'e.g. SOUL_Mortal' : 'e.g. FreeFire_Player'}
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                    {tournament.game} Player ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={uid}
                    onChange={(e) => setUid(e.target.value)}
                    placeholder="e.g. 5172635412"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Team identities */}
            {tournament.team_size > 1 && (
              <div className="p-4 rounded-2xl bg-surface-200/60 border border-surface-border space-y-4">
                <div className="text-xs font-mono uppercase font-bold text-cyanAccent-400">
                  Teammates ({tournament.team_size - 1} required)
                </div>
                {teammates.map((tm, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <input
                        type="text"
                        value={tm.ign}
                        onChange={(e) => {
                          const copy = [...teammates];
                          copy[idx].ign = e.target.value;
                          setTeammates(copy);
                        }}
                        placeholder={`Player ${idx + 2} ${tournament.game} IGN`}
                        required
                        className="w-full px-3.5 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={tm.uid}
                        onChange={(e) => {
                          const copy = [...teammates];
                          copy[idx].uid = e.target.value;
                          setTeammates(copy);
                        }}
                        placeholder={`Player ${idx + 2} ${tournament.game} ID`}
                        required
                        className="w-full px-3.5 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Submit button */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsRegistering(false)}
                className="px-5 py-2.5 rounded-xl bg-surface-200 hover:bg-surface-50 text-xs font-mono text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReg}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 hover:to-cyanAccent-500 text-white font-bold text-xs uppercase tracking-wider shadow-glow disabled:opacity-60"
              >
                {isSubmittingReg ? 'Registering...' : isFree ? 'Confirm Free Registration' : 'Proceed to Payment (₹' + entryFeeInr + ')'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. TABS NAVIGATION */}
      <div className="flex border-b border-surface-border space-x-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors ${
            activeTab === 'overview'
              ? 'border-brand-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Overview & Schedule
        </button>
        <button
          onClick={() => setActiveTab('fixtures')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-1.5 ${
            activeTab === 'fixtures'
              ? 'border-cyanAccent-500 text-cyanAccent-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Swords className="w-4 h-4" />
          <span>Matches & Fixtures ({matches.length})</span>
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('participants')}
            className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-1.5 ${
              activeTab === 'participants'
                ? 'border-brand-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Participants ({registrations.filter(r => ['confirmed', 'payment_submitted', 'pending_payment'].includes(r.status)).length})</span>
          </button>
        )}
        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors ${
            activeTab === 'rules'
              ? 'border-brand-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Rules & Fair Play
        </button>
      </div>

      {/* 5. TAB CONTENTS */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 rounded-2xl bg-surface-100 border border-surface-border space-y-4">
              <h3 className="font-display font-bold text-white text-lg">
                Tournament Information
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                {tournament.description}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-surface-border">
                <div>
                  <span className="text-[11px] font-mono uppercase text-gray-400">Game & Mode</span>
                  <div className="font-semibold text-white text-sm mt-0.5">{tournament.game} • {tournament.mode}</div>
                </div>
                <div>
                  <span className="text-[11px] font-mono uppercase text-gray-400">Format</span>
                  <div className="font-semibold text-cyanAccent-400 text-sm mt-0.5">{tournament.tournament_format}</div>
                </div>
                <div>
                  <span className="text-[11px] font-mono uppercase text-gray-400">Slots Filled</span>
                  <div className="font-semibold text-white text-sm mt-0.5">
                    {tournament.registered_count || 0} / {tournament.max_slots}
                  </div>
                </div>
              </div>
            </div>

            {/* Prize Distribution */}
            {tournament.prize_distribution && tournament.prize_distribution.length > 0 && (
              <div className="p-6 rounded-2xl bg-surface-100 border border-surface-border space-y-4">
                <h3 className="font-display font-bold text-white text-lg flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>Prize Distribution</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {tournament.prize_distribution.map((prize, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-surface-200 border border-surface-border flex items-center justify-between font-mono"
                    >
                      <span className="text-xs text-gray-400 font-bold">{prize.place}</span>
                      <span className="text-sm font-black text-amber-300">₹{prize.amount.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Schedule Column */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-surface-100 border border-surface-border space-y-4">
              <h3 className="font-display font-bold text-white text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyanAccent-400" />
                <span>Schedule (Asia/Kolkata)</span>
              </h3>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-surface-200 border border-surface-border">
                  <div className="text-gray-400">REGISTRATION OPENS</div>
                  <div className="font-semibold text-white mt-0.5">{formatIst(tournament.registration_opens_at)}</div>
                </div>
                <div className="p-3 rounded-xl bg-surface-200 border border-surface-border">
                  <div className="text-gray-400">REGISTRATION CLOSES</div>
                  <div className="font-semibold text-white mt-0.5">{formatIst(tournament.registration_closes_at)}</div>
                </div>
                <div className="p-3 rounded-xl bg-surface-200 border border-surface-border">
                  <div className="text-cyanAccent-400 font-bold">MATCH COMMENCEMENT</div>
                  <div className="font-semibold text-white mt-0.5">{formatIst(tournament.start_time)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FIXTURES TAB */}
      {activeTab === 'fixtures' && (
        <div className="space-y-4">
          {matches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fixtureMatches.map((m) => (
                <div key={m.id} className="p-5 rounded-2xl bg-surface-100 border border-surface-border space-y-3">
                  <div className="flex items-center justify-between border-b border-surface-border pb-3">
                    <div>
                      {tournament.tournament_format === 'Battle Royale' ? (
                        <>
                          <span className="text-xs font-mono text-cyanAccent-400 uppercase font-bold">Match {fixtureMatchNumbers.get(m.id)} · {tournament.game}</span>
                          <div className="text-sm font-semibold text-white mt-1">{getBattleRoyaleLobbyDescription(m.round_label)}</div>
                        </>
                      ) : (
                        <span className="text-xs font-mono text-cyanAccent-400 uppercase font-bold">{m.round_label} · Match {m.match_number}</span>
                      )}
                      <div className="text-[11px] font-mono text-gray-400">{formatIst(m.scheduled_time)}</div>
                    </div>
                    <StatusBadge status={m.status} size="sm" />
                  </div>

                  {/* Match Participants List */}
                  <div className="space-y-2 pt-1 font-mono text-xs">
                    {m.participants && m.participants.map((p, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between ${
                          p.is_winner 
                            ? 'bg-amber-950/30 border-amber-500/40 text-amber-300' 
                            : 'bg-surface-200 border-surface-border text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 font-bold">#{p.participant_slot || idx + 1}</span>
                          <span className="font-semibold">
                            {isAdmin ? p.registration?.team_name || 'Participant' : `Slot ${p.participant_slot || idx + 1}`}
                          </span>
                          {p.is_winner && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">WINNER</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {p.kills > 0 && <span className="text-cyanAccent-400">{p.kills} Kills</span>}
                          {p.points > 0 && <span className="font-bold text-white">{p.points} PTS</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-surface-100 border border-surface-border p-12 text-center text-gray-400">
              <Swords className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="font-semibold text-white">Fixtures Not Yet Published</p>
              <p className="text-xs mt-1">Tournament organizers will generate brackets and custom lobbies once registrations close.</p>
            </div>
          )}
        </div>
      )}

      {/* PARTICIPANTS TAB */}
      {isAdmin && activeTab === 'participants' && (
        <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm font-mono">
              <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400">
                <tr>
                  <th className="py-3 px-4 w-16 text-center">Slot</th>
                  <th className="py-3 px-4">Squad / Team</th>
                  <th className="py-3 px-4">Captain</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Registration Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border text-xs">
                {registrations
                  .filter(r => ['confirmed', 'payment_submitted', 'pending_payment'].includes(r.status))
                  .map((r, idx) => (
                    <tr key={r.id} className="hover:bg-surface-50/50">
                      <td className="py-3 px-4 text-center text-gray-400 font-bold">
                        #{r.slot_number || idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {r.team_name}
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {r.captain?.display_name || 'Captain'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={r.status} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-right text-cyanAccent-400 font-bold">
                        {r.registration_code}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RULES TAB */}
      {activeTab === 'rules' && (
        <div className="p-6 md:p-8 rounded-2xl bg-surface-100 border border-surface-border space-y-4">
          <h3 className="font-display font-bold text-white text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Official Tournament Rulebook</span>
          </h3>
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line font-mono bg-surface-200/50 p-4 rounded-xl border border-surface-border">
            {tournament.rules}
          </div>
        </div>
      )}

      {/* UPI Payment Modal */}
      {userRegistration && (
        <UpiPaymentModal
          registrationId={userRegistration.id}
          registrationCode={userRegistration.registration_code}
          tournamentTitle={tournament.title}
          amountPaise={tournament.entry_fee_paise}
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onPaymentSubmitted={() => {
            setUserRegistration((current) => current ? { ...current, status: 'payment_submitted' } : current);
            setRegistrations((current) => current.map((registration) => registration.id === userRegistration.id
              ? { ...registration, status: 'payment_submitted' }
              : registration));
          }}
        />
      )}
    </div>
  );
}
