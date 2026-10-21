'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Avatar } from '@/components/avatar';
import { Registration, Match, Announcement, Tournament } from '@/lib/supabase/types';
import { getUserRegistrations } from '@/lib/services/registration-service';
import { getUserMatches, getMatchesByTournament } from '@/lib/services/fixture-service';
import { getAnnouncements } from '@/lib/services/announcement-service';
import { getTournamentRoomCredentials } from '@/lib/services/tournament-service';
import { StatusBadge } from '@/components/status-badge';
import { UpiPaymentModal } from '@/components/upi-payment-modal';
import { 
  Trophy, 
  Zap, 
  CreditCard, 
  Calendar, 
  Key, 
  Lock, 
  Unlock, 
  AlertCircle, 
  Bell, 
  ExternalLink,
  ChevronRight,
  Swords,
  Copy,
  Check,
  ShieldCheck,
  Sparkles,
  Gamepad2,
  Clock,
  CheckCircle2
} from 'lucide-react';

const getBattleRoyaleLobbyDescription = (label: string) =>
  label.replace(/^Match\s*\d+\s*[-:·]?\s*/i, '').replace(/^\((.*)\)$/, '$1').trim() || 'Battle Royale lobby';

export default function PlayerDashboard() {
  const { currentUser } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedPayReg, setSelectedPayReg] = useState<Registration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentUser) return;
    setIsLoading(true);

    const regs = await getUserRegistrations(currentUser.id);
    const regsWithRooms = await Promise.all(regs.map(async (registration) => {
      if (registration.status !== 'confirmed' || !registration.tournament) return registration;
      const credentials = await getTournamentRoomCredentials(registration.tournament_id);
      return credentials ? { ...registration, tournament: { ...registration.tournament, ...credentials } } : registration;
    }));
    setRegistrations(regsWithRooms);

    // Get user-specific matches
    let userMatches = await getUserMatches(currentUser.id);

    // If user has confirmed tournament registrations, also pull matches for those tournaments!
    const confirmedTourneyIds = regs.filter(r => r.status === 'confirmed').map(r => r.tournament_id);
    for (const tId of confirmedTourneyIds) {
      const tourneyMatches = await getMatchesByTournament(tId);
      tourneyMatches.forEach(tm => {
        if (!userMatches.some(um => um.id === tm.id)) {
          userMatches.push(tm);
        }
      });
    }

    setMatches(userMatches);
    const anns = await getAnnouncements();
    setAnnouncements(anns.slice(0, 3));
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();

    // Cross-tab and store mutation real-time sync
    const handleSync = () => {
      loadData();
    };
    window.addEventListener('vyrox_store_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('vyrox_store_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [currentUser]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-2xl font-display font-bold text-white">Sign In to Access Player Hub</h2>
        <p className="text-gray-400 text-sm">Track your BGMI and Free Fire tournament registrations, payments, and room credentials.</p>
        <Link
          href="/auth/signin"
          className="inline-block px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-glow"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const pastRegistrations = registrations.filter((registration) => registration.tournament?.status === 'completed' || registration.tournament?.status === 'cancelled');
  const activeRegistrations = registrations.filter((registration) => registration.tournament?.status !== 'completed' && registration.tournament?.status !== 'cancelled');
  const pastTournamentIds = new Set(pastRegistrations.map((registration) => registration.tournament_id));
  const activeMatches = matches.filter((match) => !pastTournamentIds.has(match.tournament_id));
  const confirmedRegs = activeRegistrations.filter(r => r.status === 'confirmed');
  const battleRoyaleMatchesByTournament = new Map<string, Match[]>();
  for (const match of activeMatches.filter((item) => item.format === 'Battle Royale')) {
    const group = battleRoyaleMatchesByTournament.get(match.tournament_id) || [];
    group.push(match);
    battleRoyaleMatchesByTournament.set(match.tournament_id, group);
  }
  const battleRoyaleMatchNumbers = new Map<string, number>();
  for (const tournamentMatches of battleRoyaleMatchesByTournament.values()) {
    tournamentMatches
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.scheduled_time.localeCompare(b.scheduled_time) || a.id.localeCompare(b.id))
      .forEach((match, index) => battleRoyaleMatchNumbers.set(match.id, index + 1));
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* 1. PLAYER PROFILE SUMMARY BANNER */}
      <div className="relative rounded-3xl bg-surface-100 border border-surface-border p-6 md:p-8 overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-cyanAccent-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser.display_name} avatarUrl={currentUser.avatar_url} className="w-16 h-16 rounded-2xl text-2xl shadow-glow" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-black text-white">
                  {currentUser.display_name}
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-brand-950/60 text-brand-300 border border-brand-500/30">
                  Player Verified
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-gray-400 mt-1">
                <span>@{currentUser.username}</span>
                <span>•</span>
                <span className="text-cyanAccent-400 font-semibold">BGMI: {currentUser.bgmi_ign || 'Not set'}</span>
                <span>•</span>
                <span className="text-orange-300 font-semibold">Free Fire: {currentUser.free_fire_ign || 'Not set'}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-4 gap-4 w-full md:w-auto bg-surface-200/80 p-3 rounded-2xl border border-surface-border">
            <div className="text-center px-2">
              <div className="text-xs font-mono uppercase text-gray-400">Rating</div>
              <div className="text-lg font-black font-mono text-brand-400 flex items-center justify-center gap-0.5 mt-0.5">
                <Zap className="w-3.5 h-3.5 text-brand-400" />
                {currentUser.current_rating}
              </div>
            </div>
            <div className="text-center px-2 border-l border-surface-border">
              <div className="text-xs font-mono uppercase text-gray-400">Events</div>
              <div className="text-lg font-black font-mono text-white mt-0.5">
                {currentUser.total_tournaments}
              </div>
            </div>
            <div className="text-center px-2 border-l border-surface-border">
              <div className="text-xs font-mono uppercase text-gray-400">Wins</div>
              <div className="text-lg font-black font-mono text-amber-400 mt-0.5">
                {currentUser.total_wins}
              </div>
            </div>
            <div className="text-center px-2 border-l border-surface-border">
              <div className="text-xs font-mono uppercase text-gray-400">Kills</div>
              <div className="text-lg font-black font-mono text-cyanAccent-400 mt-0.5">
                {currentUser.total_kills}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PROMINENT VERIFIED CUSTOM ROOM ACCESS PASS (Item 2 Requested by User) */}
      {confirmedRegs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Key className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-xl font-display font-bold text-white">
              Approved Custom Lobby Room Credentials
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40 ml-auto">
              RESTRICTED TO YOUR SQUAD
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {confirmedRegs.map((reg) => {
              const tourney = reg.tournament;
              const hasRoom = tourney?.room_id && tourney?.room_password;

              return (
                <div
                  key={reg.id}
                  className="rounded-3xl bg-gradient-to-br from-emerald-950/30 via-surface-100 to-surface-100 border-2 border-emerald-500/40 p-6 shadow-glow-sm space-y-4 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-surface-border pb-3">
                    <div>
                      <div className="text-xs font-mono text-emerald-400 font-bold uppercase flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        <span>CONFIRMED SQUAD ACCESS PASS</span>
                      </div>
                      <h3 className="font-display font-black text-white text-lg mt-0.5">
                        {tourney?.title}
                      </h3>
                      <div className="text-xs font-mono text-gray-400 mt-0.5">
                        Tournament entry: <strong className="text-white">{reg.team_name || 'Solo player'}</strong>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono uppercase text-gray-400">ASSIGNED SLOT</span>
                      <div className="font-mono font-black text-cyanAccent-400 text-lg">
                        Slot #{reg.slot_number || 1}
                      </div>
                    </div>
                  </div>

                  {/* Room ID and Password Box */}
                  {hasRoom ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 font-mono">
                        <div className="p-3 rounded-2xl bg-surface-200 border border-surface-border space-y-1">
                          <span className="text-[10px] uppercase text-gray-400 font-bold">{tourney?.game} ROOM ID</span>
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-black text-white text-base select-all">
                              {tourney?.room_id}
                            </span>
                            <button
                              onClick={() => copyToClipboard(tourney?.room_id || '', `room-${reg.id}`)}
                              className="p-1 text-gray-400 hover:text-white transition-colors"
                              title="Copy Room ID"
                            >
                              {copiedKey === `room-${reg.id}` ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="p-3 rounded-2xl bg-surface-200 border border-surface-border space-y-1">
                          <span className="text-[10px] uppercase text-gray-400 font-bold">ROOM PASSWORD</span>
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-black text-cyanAccent-400 text-base select-all">
                              {tourney?.room_password}
                            </span>
                            <button
                              onClick={() => copyToClipboard(tourney?.room_password || '', `pass-${reg.id}`)}
                              className="p-1 text-gray-400 hover:text-white transition-colors"
                              title="Copy Password"
                            >
                              {copiedKey === `pass-${reg.id}` ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-surface-200/60 border border-surface-border text-[11px] font-mono text-gray-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Credentials Active</span>
                        </span>
                        <span className="text-gray-400">Join room at scheduled slot</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-surface-200 border border-surface-border text-xs font-mono text-gray-300 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-bold">
                        <Clock className="w-4 h-4" />
                        <span>Slot Confirmed • Room Credentials Pending Release</span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        Your payment is verified. The organizer will update the Room ID and Password 15 minutes before match commencement. It will immediately show here!
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. MY TOURNAMENTS SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>My Registered Tournaments</span>
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/dashboard/archive" className="text-xs font-mono text-gray-300 hover:text-white">
              Past events ({pastRegistrations.length})
            </Link>
            <Link href="/tournaments" className="text-xs font-mono text-cyanAccent-400 hover:underline flex items-center gap-1">
              <span>Browse More Competitions</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {activeRegistrations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeRegistrations.map((reg) => {
              const isFree = reg.tournament?.entry_fee_paise === 0;
              const feeInr = (reg.tournament?.entry_fee_paise || 0) / 100;
              const isTeamLeader = reg.captain_id === currentUser.id;

              return (
                <div
                  key={reg.id}
                  className="p-6 rounded-3xl bg-surface-100 border border-surface-border flex flex-col justify-between space-y-4 hover:border-brand-500/40 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-cyanAccent-400 font-bold">
                        {reg.registration_code}
                      </span>
                      <StatusBadge status={reg.status} size="sm" />
                    </div>

                    <h3 className="font-display font-bold text-white text-lg">
                      {reg.tournament?.title || 'Tournament'}
                    </h3>

                    <div className="text-xs text-gray-400 font-mono">
                      Entry: <strong className="text-white">{reg.team_name || 'Solo player'}</strong> • Mode: {reg.tournament?.mode}
                    </div>
                  </div>

                  {/* Payment / Action details */}
                  <div className="pt-3 border-t border-surface-border flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-gray-500">Entry Status:</span>
                      <div className="text-xs font-semibold text-gray-200">
                        {isFree ? 'Free Event' : `₹${feeInr} UPI`}
                      </div>
                    </div>

                    {isTeamLeader && reg.status === 'pending_payment' && (
                      <button
                        onClick={() => setSelectedPayReg(reg)}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider shadow-glow-sm flex items-center gap-1.5 transition-all"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Pay via UPI QR</span>
                      </button>
                    )}

                    {isTeamLeader && reg.status === 'payment_submitted' && (
                      <div className="px-3 py-1.5 rounded-lg bg-violet-950/50 border border-violet-500/30 text-xs font-mono text-violet-300 font-medium text-right">
                        <div>Payment verification in progress</div>
                        <div className="mt-1 text-[10px] text-gray-400">Your entry will be confirmed once payment is verified.</div>
                      </div>
                    )}

                    {reg.status === 'confirmed' && (
                      <Link
                        href={`/tournaments/${reg.tournament?.slug}`}
                        className="px-3.5 py-1.5 rounded-xl bg-surface-200 hover:bg-surface-50 border border-surface-border text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1.5"
                      >
                        <span>View Tournament Hub</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}

                    {isTeamLeader && reg.status === 'rejected' && (
                      <button
                        onClick={() => setSelectedPayReg(reg)}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider"
                      >
                        Resubmit UTR
                      </button>
                    )}
                    {!isTeamLeader && reg.status !== 'confirmed' && (
                      <div className="max-w-xs text-right text-[11px] text-cyanAccent-200">
                        Your team leader is handling entry payment and confirmation.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl bg-surface-100 border border-surface-border p-12 text-center text-gray-400 space-y-3">
            <Swords className="w-10 h-10 text-gray-600 mx-auto" />
            <h4 className="text-sm font-semibold text-white">No Active Registrations</h4>
            <p className="text-xs max-w-sm mx-auto">
              You haven&apos;t entered any tournaments yet. Browse BGMI and Free Fire events to join a competition.
            </p>
            <Link
              href="/tournaments"
              className="inline-block px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-sm"
            >
              Browse Tournaments
            </Link>
          </div>
        )}
      </div>

      {/* 4. MY MATCHES SECTION */}
      <div className="space-y-4">
        <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-cyanAccent-400" />
          <span>Scheduled Match Fixtures</span>
        </h2>

        {activeMatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeMatches.map((m) => {
              const isMatchRoomUnlocked = m.room_released || confirmedRegs.some(r => r.tournament_id === m.tournament_id);

              return (
                <div key={m.id} className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
                  <div className="flex items-center justify-between border-b border-surface-border pb-3">
                    <div>
                      {m.format === 'Battle Royale' ? (
                        <>
                          <span className="text-xs font-mono text-cyanAccent-400 font-bold uppercase">Match {battleRoyaleMatchNumbers.get(m.id)} · Battle Royale</span>
                          <div className="text-sm font-semibold text-white mt-1">{getBattleRoyaleLobbyDescription(m.round_label)}</div>
                        </>
                      ) : (
                        <span className="text-xs font-mono text-cyanAccent-400 font-bold uppercase">Round {m.round_number} · Match {m.match_number} · {m.round_label}</span>
                      )}
                      <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                        {new Date(m.scheduled_time).toLocaleDateString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })} IST
                      </div>
                    </div>
                    <StatusBadge status={m.status} size="sm" />
                  </div>

                  {/* Room Credentials for this match */}
                  {isMatchRoomUnlocked && m.room_id ? (
                    <div className="p-3.5 rounded-2xl bg-surface-200 border border-emerald-500/30 flex items-center justify-between font-mono text-xs">
                      <div>
                        <div className="text-[10px] uppercase text-gray-400">ROOM ID</div>
                        <div className="font-bold text-white text-sm select-all">{m.room_id}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-gray-400">PASSWORD</div>
                        <div className="font-bold text-cyanAccent-400 text-sm select-all">{m.room_password}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-surface-200 border border-surface-border text-xs font-mono text-gray-400 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span>Lobby credentials will unlock 15 minutes before the match start time.</span>
                    </div>
                  )}

                  {/* Participants in lobby */}
                  {m.participants && m.participants.length > 0 && (
                    <div className="text-[11px] font-mono text-gray-400">
                      Lobby Squads: <strong className="text-white">{m.participants.length}</strong> assigned
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl bg-surface-100 border border-surface-border p-8 text-center text-xs font-mono text-gray-400 space-y-1">
            <p className="text-white font-semibold">No Custom Lobbies Scheduled Yet</p>
            <p>Once tournament registrations close, custom lobbies and brackets will appear here with your assigned slot.</p>
          </div>
        )}
      </div>

      {/* Payment Modal if player clicked Pay */}
      {selectedPayReg && (
        <UpiPaymentModal
          registrationId={selectedPayReg.id}
          registrationCode={selectedPayReg.registration_code}
          tournamentTitle={selectedPayReg.tournament?.title || 'Tournament'}
          amountPaise={selectedPayReg.tournament?.entry_fee_paise || 0}
          isOpen={Boolean(selectedPayReg)}
          onClose={() => setSelectedPayReg(null)}
          onPaymentSubmitted={() => {
            setRegistrations((current) => current.map((registration) => registration.id === selectedPayReg.id
              ? { ...registration, status: 'payment_submitted' }
              : registration));
          }}
        />
      )}
    </div>
  );
}
