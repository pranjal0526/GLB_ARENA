'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Tournament, 
  Registration, 
  Match, 
  RegistrationMember 
} from '@/lib/supabase/types';
import { getTournamentBySlug } from '@/lib/services/tournament-service';
import { 
  getRegistrationsByTournament, 
  registerForTournament 
} from '@/lib/services/registration-service';
import { getMatchesByTournament } from '@/lib/services/fixture-service';
import { useAuth } from '@/lib/auth-context';
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

export default function TournamentDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();
  const { currentUser } = useAuth();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userRegistration, setUserRegistration] = useState<Registration | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      const regs = await getRegistrationsByTournament(t.id);
      setRegistrations(regs);
      const m = await getMatchesByTournament(t.id);
      setMatches(m);

      if (currentUser) {
        const userReg = regs.find(r => r.captain_id === currentUser.id);
        setUserRegistration(userReg || null);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [slug, currentUser]);

  // Pre-fill profile IGN and UID when user logs in
  useEffect(() => {
    if (currentUser) {
      if (currentUser.bgmi_ign) setIgn(currentUser.bgmi_ign);
      if (currentUser.bgmi_uid) setUid(currentUser.bgmi_uid);
      if (tournament && tournament.mode === 'Squad') {
        setTeammates([
          { ign: '', uid: '' },
          { ign: '', uid: '' },
          { ign: '', uid: '' },
        ]);
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
  const entryFeeInr = tournament.entry_fee_paise / 100;
  const prizePoolInr = tournament.prize_pool_paise / 100;

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
    setIsSubmittingReg(true);

    try {
      const res = await registerForTournament({
        tournamentId: tournament.id,
        captainId: currentUser.id,
        teamName: teamName || ign,
        ign: ign.trim(),
        uid: uid.trim(),
        teammates: tournament.mode === 'Squad' ? teammates.filter(t => t.ign && t.uid) : undefined,
      });

      if (!res.success) {
        setRegError(res.error || 'Failed to submit registration');
      } else if (res.registration) {
        setUserRegistration(res.registration);
        setIsRegistering(false);
        await loadData();

        // If paid, immediately open UPI payment modal!
        if (!isFree) {
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
  const showRoomDetails = (isUserConfirmed || currentUser?.role === 'admin') && tournament.room_released;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. TOURNAMENT HERO BANNER */}
      <div className="relative rounded-3xl overflow-hidden bg-surface-100 border border-surface-border">
        <div className="relative h-64 md:h-80 w-full bg-surface-200 overflow-hidden">
          {tournament.banner_url && (
            <img
              src={tournament.banner_url}
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
            <StatusBadge status={tournament.status} />
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

                  {userRegistration.status === 'pending_payment' && (
                    <button
                      onClick={() => setPaymentModalOpen(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs uppercase tracking-wider shadow-glow-sm transition-all flex items-center justify-center gap-1.5"
                    >
                      <IndianRupee className="w-3.5 h-3.5" />
                      <span>Submit UPI Reference</span>
                    </button>
                  )}

                  {userRegistration.status === 'payment_submitted' && (
                    <div className="p-2.5 rounded-xl bg-violet-950/40 border border-violet-500/30 text-[11px] text-violet-300 text-center font-mono">
                      UTR Reference Submitted. Awaiting Organizer Verification.
                    </div>
                  )}

                  {userRegistration.status === 'confirmed' && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 text-center font-mono flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmed • Slot #{userRegistration.slot_number || 1}</span>
                    </div>
                  )}
                </div>
              ) : tournament.status === 'open' ? (
                <button
                  onClick={() => setIsRegistering(true)}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 hover:to-cyanAccent-500 text-white font-bold text-sm uppercase tracking-wider shadow-glow hover:shadow-glow-cyan transition-all flex items-center justify-center gap-2"
                >
                  <Swords className="w-4 h-4" />
                  <span>Register Squad Now</span>
                </button>
              ) : (
                <div className="text-center py-2 text-xs font-mono text-gray-400">
                  Registration is {tournament.status.toUpperCase()}
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
                <span>BGMI Custom Lobby Credentials</span>
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
                <div className="font-mono font-bold text-white text-base select-all">{tournament.room_id}</div>
              </div>
              <div className="h-8 w-px bg-surface-border hidden sm:block" />
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400">PASSWORD:</span>
                <div className="font-mono font-bold text-cyanAccent-400 text-base select-all">{tournament.room_password}</div>
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
                Squad Registration — {tournament.title}
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

            {/* Captain BGMI Details */}
            <div className="p-4 rounded-2xl bg-surface-200/60 border border-surface-border space-y-4">
              <div className="text-xs font-mono uppercase font-bold text-brand-300">
                Captain / Leader Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                    BGMI In-Game Name (IGN) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={ign}
                    onChange={(e) => setIgn(e.target.value)}
                    placeholder="e.g. SOUL_Mortal"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                    BGMI Character UID <span className="text-rose-400">*</span>
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

            {/* Teammates section if Squad */}
            {tournament.mode === 'Squad' && (
              <div className="p-4 rounded-2xl bg-surface-200/60 border border-surface-border space-y-4">
                <div className="text-xs font-mono uppercase font-bold text-cyanAccent-400">
                  Squad Teammates (Optional at initial registration)
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
                        placeholder={`Player ${idx + 2} BGMI IGN`}
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
                        placeholder={`Player ${idx + 2} BGMI UID`}
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
        <button
          onClick={() => setActiveTab('participants')}
          className={`pb-3 text-sm font-semibold border-b-2 font-mono transition-colors flex items-center gap-1.5 ${
            activeTab === 'participants'
              ? 'border-brand-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Participants ({registrations.filter(r => r.status === 'confirmed').length})</span>
        </button>
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
                    {registrations.filter(r => ['confirmed', 'payment_submitted'].includes(r.status)).length} / {tournament.max_slots}
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
                      <span className="text-xs text-gray-400 font-bold">{prize.place} Place</span>
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
              {matches.map((m) => (
                <div key={m.id} className="p-5 rounded-2xl bg-surface-100 border border-surface-border space-y-3">
                  <div className="flex items-center justify-between border-b border-surface-border pb-3">
                    <div>
                      <span className="text-xs font-mono text-cyanAccent-400 uppercase font-bold">{m.round_label}</span>
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
                          <span className="font-semibold">{p.registration?.team_name || 'Participant'}</span>
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
      {activeTab === 'participants' && (
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
                  .filter(r => ['confirmed', 'payment_submitted'].includes(r.status))
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
            loadData();
          }}
        />
      )}
    </div>
  );
}
