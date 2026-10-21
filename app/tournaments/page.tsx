'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tournament, TournamentMode, TournamentStatus } from '@/lib/supabase/types';
import { getTournaments } from '@/lib/services/tournament-service';
import { TournamentCard } from '@/components/tournament-card';
import { Search, Filter, Sparkles, Swords, Clock } from 'lucide-react';

export default function TournamentsDirectoryPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGame, setSelectedGame] = useState<'all' | 'BGMI' | 'Free Fire'>('all');
  const [selectedStatus, setSelectedStatus] = useState<TournamentStatus | 'all'>('all');
  const [selectedMode, setSelectedMode] = useState<TournamentMode | 'all'>('all');
  const [selectedFee, setSelectedFee] = useState<'all' | 'free' | 'paid'>('all');
  const [sortBy, setSortBy] = useState<'start_time_asc' | 'prize_desc'>('start_time_asc');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const data = await getTournaments({
        search,
        game: selectedGame,
        status: selectedStatus,
        mode: selectedMode,
        feeType: selectedFee,
        sortBy,
      });
        setTournaments(data.filter((tournament) => tournament.status !== 'completed' && tournament.status !== 'cancelled' && tournament.status !== 'draft'));
      setIsLoading(false);
    }
    load();
  }, [search, selectedGame, selectedStatus, selectedMode, selectedFee, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-surface-border pb-6">
        <div>
          <div className="text-xs font-mono uppercase text-cyanAccent-400 tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>DISCOVER COMPETITIONS</span>
          </div>
          <h1 className="text-3xl font-display font-extrabold text-white mt-1">
            Tournament Directory
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Find BGMI and Free Fire tournaments by game, mode, registration status, and prize pool.
          </p>
        </div>

        <div className="text-xs font-mono text-gray-400">
          Showing <span className="text-white font-bold">{tournaments.length}</span> tournaments
        </div>
        <Link href="/tournaments/archive" className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-100 px-4 py-2 text-xs font-mono text-gray-300 hover:text-white">
          <Clock className="w-3.5 h-3.5" /> Past tournaments
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border space-y-4">
        {/* Top search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tournaments by title, format, or game..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Filter Badges & Selectors */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <div className="flex items-center gap-1.5 text-xs font-mono text-gray-400 mr-2">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value as 'all' | 'BGMI' | 'Free Fire')}
            className="px-3 py-1.5 rounded-lg bg-surface-200 border border-surface-border text-xs text-cyanAccent-400 focus:outline-none font-mono font-semibold"
          >
            <option value="all">All Games</option>
            <option value="BGMI">BGMI</option>
            <option value="Free Fire">Free Fire</option>
          </select>

          {/* Mode Selector */}
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as TournamentMode | 'all')}
            className="px-3 py-1.5 rounded-lg bg-surface-200 border border-surface-border text-xs text-gray-200 focus:outline-none font-mono"
          >
            <option value="all">All Modes</option>
            <option value="Squad">Squad (2–4 player Battle Royale)</option>
            <option value="1v1">1v1 Arena</option>
            <option value="2v2">2v2 Arena</option>
            <option value="3v3">3v3 Arena</option>
            <option value="4v4">4v4 Arena</option>
            <option value="Solo">Solo Battle Royale</option>
            <option value="Duo">Duo Battle Royale</option>
          </select>

          {/* Status Selector */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as TournamentStatus | 'all')}
            className="px-3 py-1.5 rounded-lg bg-surface-200 border border-surface-border text-xs text-gray-200 focus:outline-none font-mono"
          >
            <option value="all">All active statuses</option>
            <option value="open">Registration Scheduled / Open</option>
            <option value="registration_closed">Registration Closed</option>
            <option value="live">Live Now</option>
          </select>

          {/* Fee Selector */}
          <select
            value={selectedFee}
            onChange={(e) => setSelectedFee(e.target.value as 'all' | 'free' | 'paid')}
            className="px-3 py-1.5 rounded-lg bg-surface-200 border border-surface-border text-xs text-gray-200 focus:outline-none font-mono"
          >
            <option value="all">All Entry Fees</option>
            <option value="free">Free Entry</option>
            <option value="paid">Paid (₹)</option>
          </select>

          {/* Sort Selector */}
          <div className="ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'start_time_asc' | 'prize_desc')}
              className="px-3 py-1.5 rounded-lg bg-surface-200 border border-surface-border text-xs text-cyanAccent-400 focus:outline-none font-mono font-semibold"
            >
              <option value="start_time_asc">Sort: Starting Soonest</option>
              <option value="prize_desc">Sort: Highest Prize Pool</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tournament Cards Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-gray-400 font-mono text-sm animate-pulse">
          Loading tournaments from database...
        </div>
      ) : tournaments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-surface-100 border border-surface-border p-16 text-center space-y-3">
          <Swords className="w-12 h-12 text-gray-600 mx-auto" />
          <h3 className="text-lg font-display font-bold text-white">No Tournaments Found</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            No competitions match your search query or filters. Try resetting the filters above.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setSelectedGame('all');
              setSelectedStatus('all');
              setSelectedMode('all');
              setSelectedFee('all');
            }}
            className="px-4 py-2 rounded-lg bg-surface-200 hover:bg-surface-50 text-xs font-mono text-cyanAccent-400 border border-surface-border transition-colors mt-2"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}
