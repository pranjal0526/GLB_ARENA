'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ChevronLeft } from 'lucide-react';
import { Tournament } from '@/lib/supabase/types';
import { getTournaments } from '@/lib/services/tournament-service';
import { TournamentCard } from '@/components/tournament-card';

export default function TournamentArchivePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTournaments()
      .then((rows) => setTournaments(rows.filter((tournament) => tournament.status === 'completed' || tournament.status === 'cancelled')))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Past tournaments could not be loaded.'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-surface-border pb-6">
        <div>
          <div className="text-xs font-mono uppercase text-cyanAccent-400 tracking-wider flex items-center gap-2">
            <Archive className="w-3.5 h-3.5" /> Event archive
          </div>
          <h1 className="text-3xl font-display font-extrabold text-white mt-1">Past tournaments</h1>
          <p className="text-sm text-gray-400 mt-1">Completed and cancelled events are kept here for reference.</p>
        </div>
        <Link href="/tournaments" className="inline-flex items-center gap-2 text-xs font-mono text-cyanAccent-400 hover:text-white">
          <ChevronLeft className="w-4 h-4" /> Back to active tournaments
        </Link>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading past tournaments…</div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-5 text-sm text-rose-200">{error}</div>
      ) : tournaments.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}
        </div>
      ) : (
        <div className="rounded-2xl bg-surface-100 border border-surface-border p-12 text-center space-y-3">
          <Archive className="w-10 h-10 text-gray-600 mx-auto" />
          <h2 className="text-lg font-display font-bold text-white">No past tournaments yet</h2>
          <p className="text-sm text-gray-400">Completed and cancelled events will appear here.</p>
        </div>
      )}
    </div>
  );
}
