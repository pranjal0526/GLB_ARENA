'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ChevronLeft, Trophy } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Registration } from '@/lib/supabase/types';
import { getUserRegistrations } from '@/lib/services/registration-service';
import { StatusBadge } from '@/components/status-badge';

export default function PlayerEventArchivePage() {
  const { currentUser } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    getUserRegistrations(currentUser.id)
      .then((rows) => setRegistrations(rows.filter((registration) => registration.tournament?.status === 'completed' || registration.tournament?.status === 'cancelled')))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Your past events could not be loaded.'))
      .finally(() => setIsLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-display font-bold text-white">Sign in to view your past events</h1>
        <Link href="/auth/signin" className="inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-surface-border pb-6">
        <div>
          <div className="text-xs font-mono uppercase text-cyanAccent-400 tracking-wider flex items-center gap-2"><Archive className="w-3.5 h-3.5" /> Player history</div>
          <h1 className="text-3xl font-display font-extrabold text-white mt-1">My past events</h1>
          <p className="text-sm text-gray-400 mt-1">Your completed and cancelled tournament entries stay here.</p>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs font-mono text-cyanAccent-400 hover:text-white"><ChevronLeft className="w-4 h-4" /> Back to Player Hub</Link>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading your event history…</div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-5 text-sm text-rose-200">{error}</div>
      ) : registrations.length ? (
        <div className="space-y-3">
          {registrations.map((registration) => {
            const tournament = registration.tournament;
            if (!tournament) return null;
            return (
              <article key={registration.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-surface-border bg-surface-100 p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-1 w-9 h-9 rounded-xl bg-amber-500/10 text-amber-300 flex items-center justify-center"><Trophy className="w-4 h-4" /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display font-bold text-white">{tournament.title}</h2>
                      <StatusBadge status={tournament.status} size="sm" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{tournament.game} · {tournament.mode} · Team: {registration.team_name || 'Solo entry'}</p>
                    <p className="text-[11px] text-gray-500 font-mono mt-1">Registration {registration.registration_code}</p>
                    {tournament.status === 'cancelled' && tournament.cancellation_reason && <p className="text-xs text-rose-300 mt-2">Cancellation note: {tournament.cancellation_reason}</p>}
                  </div>
                </div>
                <Link href={`/tournaments/${tournament.slug}`} className="shrink-0 rounded-xl border border-surface-border bg-surface-200 px-4 py-2 text-xs font-mono text-cyanAccent-400 hover:text-white">View event details</Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-surface-100 border border-surface-border p-12 text-center space-y-3">
          <Archive className="w-10 h-10 text-gray-600 mx-auto" />
          <h2 className="text-lg font-display font-bold text-white">No past entries yet</h2>
          <p className="text-sm text-gray-400">When one of your tournaments is completed or cancelled, it will move here.</p>
        </div>
      )}
    </div>
  );
}
