'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Registration, Match, Announcement } from '@/lib/supabase/types';
import { getUserRegistrations } from '@/lib/services/registration-service';
import { getUserMatches } from '@/lib/services/fixture-service';
import { getAnnouncements } from '@/lib/services/announcement-service';
import { StatusBadge } from '@/components/status-badge';
import { UpiPaymentModal } from '@/components/upi-payment-modal';
import { 
  Trophy, 
  Flame, 
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
  Swords
} from 'lucide-react';

export default function PlayerDashboard() {
  const { currentUser } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedPayReg, setSelectedPayReg] = useState<Registration | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    const regs = await getUserRegistrations(currentUser.id);
    setRegistrations(regs);
    const userMatches = await getUserMatches(currentUser.id);
    setMatches(userMatches);
    const anns = await getAnnouncements();
    setAnnouncements(anns.slice(0, 3));
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-2xl font-display font-bold text-white">Sign In to Access Player Hub</h2>
        <p className="text-gray-400 text-sm">Track your BGMI tournament registrations, payments, and lobby fixtures.</p>
        <Link
          href="/auth/signin"
          className="inline-block px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-glow"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* 1. PLAYER PROFILE SUMMARY BANNER */}
      <div className="relative rounded-3xl bg-surface-100 border border-surface-border p-6 md:p-8 overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-cyanAccent-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyanAccent-500 p-0.5 flex items-center justify-center shadow-glow">
              <div className="w-full h-full bg-surface-200 rounded-[14px] flex items-center justify-center font-display font-black text-2xl text-white">
                {currentUser.display_name.charAt(0)}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-black text-white">
                  {currentUser.display_name}
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-brand-950/60 text-brand-300 border border-brand-500/30">
                  {currentUser.role}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-gray-400 mt-1">
                <span>@{currentUser.username}</span>
                <span>•</span>
                <span className="text-cyanAccent-400 font-semibold">IGN: {currentUser.bgmi_ign || 'Not set'}</span>
                <span>•</span>
                <span className="text-gray-400">UID: {currentUser.bgmi_uid || 'Not set'}</span>
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

      {/* 2. ANNOUNCEMENTS CAROUSEL / NOTICES */}
      {announcements.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-950/30 to-surface-100 border border-brand-500/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase text-brand-400 font-bold">LATEST NOTICE:</span>
              <div className="text-xs font-semibold text-white mt-0.5">{announcements[0].title}</div>
            </div>
          </div>
          <span className="text-[11px] font-mono text-gray-500 hidden sm:block">
            {new Date(announcements[0].created_at).toLocaleDateString('en-IN')}
          </span>
        </div>
      )}

      {/* 3. MY TOURNAMENTS SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>My Registered Tournaments</span>
          </h2>
          <Link
            href="/tournaments"
            className="text-xs font-mono text-cyanAccent-400 hover:underline flex items-center gap-1"
          >
            <span>Explore More</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {registrations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {registrations.map((reg) => {
              const isFree = reg.tournament?.entry_fee_paise === 0;
              const feeInr = (reg.tournament?.entry_fee_paise || 0) / 100;

              return (
                <div
                  key={reg.id}
                  className="p-5 rounded-2xl bg-surface-100 border border-surface-border flex flex-col justify-between space-y-4 hover:border-brand-500/40 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-cyanAccent-400 font-bold">
                        {reg.registration_code}
                      </span>
                      <StatusBadge status={reg.status} size="sm" />
                    </div>

                    <h3 className="font-display font-bold text-white text-base">
                      {reg.tournament?.title || 'Tournament'}
                    </h3>

                    <div className="text-xs text-gray-400 font-mono">
                      Team: <strong className="text-white">{reg.team_name}</strong> • Mode: {reg.tournament?.mode}
                    </div>
                  </div>

                  {/* Payment / Action details */}
                  <div className="pt-3 border-t border-surface-border flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-gray-500">Entry Status:</span>
                      <div className="text-xs font-semibold text-gray-200">
                        {isFree ? 'Free Event' : `₹${feeInr} UPI`}
                      </div>
                    </div>

                    {reg.status === 'pending_payment' && (
                      <button
                        onClick={() => setSelectedPayReg(reg)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider shadow-glow-sm flex items-center gap-1.5 transition-all"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Pay UPI QR</span>
                      </button>
                    )}

                    {reg.status === 'payment_submitted' && (
                      <span className="text-xs font-mono text-violet-400 font-medium">
                        Verification in Progress
                      </span>
                    )}

                    {reg.status === 'confirmed' && (
                      <Link
                        href={`/tournaments/${reg.tournament?.slug}`}
                        className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <span>View Lobby</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}

                    {reg.status === 'rejected' && (
                      <button
                        onClick={() => setSelectedPayReg(reg)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider"
                      >
                        Resubmit UTR
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-100 border border-surface-border p-12 text-center text-gray-400 space-y-3">
            <Swords className="w-10 h-10 text-gray-600 mx-auto" />
            <h4 className="text-sm font-semibold text-white">No Active Registrations</h4>
            <p className="text-xs max-w-sm mx-auto">
              You haven&apos;t joined any BGMI tournaments yet. Explore the directory to claim your squad slot.
            </p>
            <Link
              href="/tournaments"
              className="inline-block px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-sm"
            >
              Browse Tournaments
            </Link>
          </div>
        )}
      </div>

      {/* 4. MY MATCHES & ROOM CREDENTIALS */}
      <div className="space-y-4">
        <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
          <Key className="w-5 h-5 text-cyanAccent-400" />
          <span>My Matches & Custom Room Access</span>
        </h2>

        {matches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((m) => (
              <div key={m.id} className="p-5 rounded-2xl bg-surface-100 border border-surface-border space-y-4">
                <div className="flex items-center justify-between border-b border-surface-border pb-3">
                  <div>
                    <span className="text-xs font-mono text-cyanAccent-400 font-bold uppercase">{m.round_label}</span>
                    <div className="text-[11px] font-mono text-gray-400">
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

                {/* Restricted Room Credentials */}
                {m.room_released ? (
                  <div className="p-3.5 rounded-xl bg-surface-200 border border-emerald-500/30 flex items-center justify-between font-mono text-xs">
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
                  <div className="p-3 rounded-xl bg-surface-200 border border-surface-border text-xs font-mono text-gray-400 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>Room ID & password release 15 minutes before match start.</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-100 border border-surface-border p-8 text-center text-xs font-mono text-gray-400">
            No scheduled match fixtures for your squad yet. Check back once tournament registrations close.
          </div>
        )}
      </div>

      {/* Payment Modal if user clicked Pay on any registration */}
      {selectedPayReg && (
        <UpiPaymentModal
          registrationId={selectedPayReg.id}
          registrationCode={selectedPayReg.registration_code}
          tournamentTitle={selectedPayReg.tournament?.title || 'Tournament'}
          amountPaise={selectedPayReg.tournament?.entry_fee_paise || 0}
          isOpen={Boolean(selectedPayReg)}
          onClose={() => setSelectedPayReg(null)}
          onPaymentSubmitted={() => {
            setSelectedPayReg(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
