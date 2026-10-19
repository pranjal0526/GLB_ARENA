'use client';

import React, { useState, useEffect } from 'react';
import { Profile } from '@/lib/supabase/types';
import { getLeaderboard } from '@/lib/services/profile-service';
import { Trophy, Search, Zap, Flame, ShieldAlert, Award } from 'lucide-react';

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const data = await getLeaderboard();
      setPlayers(data);
      setIsLoading(false);
    }
    load();
  }, []);

  const filtered = players.filter(p => {
    const q = search.toLowerCase();
    return (
      p.display_name.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      (p.bgmi_ign && p.bgmi_ign.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-400">
          <Trophy className="w-3.5 h-3.5" />
          <span>OFFICIAL COMPETITIVE RANKINGS</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-display font-black text-white uppercase tracking-tight">
          National BGMI Leaderboard
        </h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          Persistent competitive player ratings calculated across verified Indian BGMI tournaments, 1v1 Arena clashes, and battle royale custom lobbies.
        </p>
      </div>

      {/* Top 3 Podium Cards */}
      {players.length >= 3 && !search && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {/* Rank 2 (Silver) */}
          <div className="md:order-1 rounded-2xl bg-surface-100 border border-slate-500/30 p-6 flex flex-col items-center text-center relative overflow-hidden shadow-lg md:translate-y-4">
            <div className="w-10 h-10 rounded-full bg-slate-400/20 text-slate-300 font-mono font-bold flex items-center justify-center text-sm mb-3 border border-slate-400/40">
              #2
            </div>
            <div className="w-16 h-16 rounded-2xl bg-brand-900 border border-brand-500/30 flex items-center justify-center font-display font-black text-xl text-brand-300 mb-3">
              {players[1].display_name.charAt(0)}
            </div>
            <h3 className="font-display font-bold text-white text-lg">{players[1].display_name}</h3>
            <div className="text-xs font-mono text-cyanAccent-400 font-semibold mt-0.5">{players[1].bgmi_ign}</div>
            <div className="text-2xl font-black font-mono text-slate-200 mt-4 flex items-center gap-1">
              <Zap className="w-5 h-5 text-brand-400" />
              {players[1].current_rating} PTS
            </div>
            <div className="mt-4 pt-4 border-t border-surface-border w-full flex justify-around text-xs font-mono text-gray-400">
              <div>Wins: <strong className="text-white">{players[1].total_wins}</strong></div>
              <div>Kills: <strong className="text-white">{players[1].total_kills}</strong></div>
            </div>
          </div>

          {/* Rank 1 (Gold - Crown) */}
          <div className="md:order-2 rounded-2xl bg-gradient-to-b from-amber-950/30 via-surface-100 to-surface-100 border border-amber-500/50 p-6 flex flex-col items-center text-center relative overflow-hidden shadow-glow">
            <div className="w-10 h-10 rounded-full bg-amber-500/30 text-amber-300 font-mono font-black flex items-center justify-center text-sm mb-3 border border-amber-500/50 animate-bounce">
              👑 #1
            </div>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5 flex items-center justify-center mb-3 shadow-glow">
              <div className="w-full h-full bg-surface-200 rounded-[14px] flex items-center justify-center font-display font-black text-2xl text-amber-300">
                {players[0].display_name.charAt(0)}
              </div>
            </div>
            <h3 className="font-display font-black text-white text-xl">{players[0].display_name}</h3>
            <div className="text-xs font-mono text-cyanAccent-400 font-bold mt-0.5">{players[0].bgmi_ign}</div>
            <div className="text-3xl font-black font-mono text-amber-300 mt-4 flex items-center gap-1">
              <Zap className="w-6 h-6 text-amber-400" />
              {players[0].current_rating} PTS
            </div>
            <div className="mt-4 pt-4 border-t border-surface-border w-full flex justify-around text-xs font-mono text-gray-400">
              <div>Wins: <strong className="text-white">{players[0].total_wins}</strong></div>
              <div>Kills: <strong className="text-white">{players[0].total_kills}</strong></div>
            </div>
          </div>

          {/* Rank 3 (Bronze) */}
          <div className="md:order-3 rounded-2xl bg-surface-100 border border-amber-800/30 p-6 flex flex-col items-center text-center relative overflow-hidden shadow-lg md:translate-y-6">
            <div className="w-10 h-10 rounded-full bg-amber-800/20 text-amber-500 font-mono font-bold flex items-center justify-center text-sm mb-3 border border-amber-800/40">
              #3
            </div>
            <div className="w-16 h-16 rounded-2xl bg-brand-900 border border-brand-500/30 flex items-center justify-center font-display font-black text-xl text-brand-300 mb-3">
              {players[2].display_name.charAt(0)}
            </div>
            <h3 className="font-display font-bold text-white text-lg">{players[2].display_name}</h3>
            <div className="text-xs font-mono text-cyanAccent-400 font-semibold mt-0.5">{players[2].bgmi_ign}</div>
            <div className="text-2xl font-black font-mono text-amber-500 mt-4 flex items-center gap-1">
              <Zap className="w-5 h-5 text-brand-400" />
              {players[2].current_rating} PTS
            </div>
            <div className="mt-4 pt-4 border-t border-surface-border w-full flex justify-around text-xs font-mono text-gray-400">
              <div>Wins: <strong className="text-white">{players[2].total_wins}</strong></div>
              <div>Kills: <strong className="text-white">{players[2].total_kills}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players by BGMI IGN, username, or display name..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-mono">
            <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400">
              <tr>
                <th className="py-4 px-4 w-16 text-center">Rank</th>
                <th className="py-4 px-4">Player</th>
                <th className="py-4 px-4">BGMI In-Game Identity</th>
                <th className="py-4 px-4 text-center">Tournaments</th>
                <th className="py-4 px-4 text-center">Wins</th>
                <th className="py-4 px-4 text-center">Kills</th>
                <th className="py-4 px-4 text-right">VYROX Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-xs">
              {filtered.map((player, idx) => (
                <tr key={player.id} className="hover:bg-surface-50/50 transition-colors">
                  <td className="py-4 px-4 text-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      idx === 0 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                        : idx === 1 
                        ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40' 
                        : idx === 2 
                        ? 'bg-amber-700/20 text-amber-500 border border-amber-700/40' 
                        : 'text-gray-400'
                    }`}>
                      #{idx + 1}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-900 border border-brand-500/30 flex items-center justify-center font-bold text-xs text-brand-300">
                        {player.display_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-white font-sans text-sm">{player.display_name}</div>
                        <div className="text-gray-400 text-[11px]">@{player.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-cyanAccent-400 font-bold">{player.bgmi_ign || 'N/A'}</div>
                    <div className="text-gray-500 text-[11px]">UID: {player.bgmi_uid || 'N/A'}</div>
                  </td>
                  <td className="py-4 px-4 text-center text-gray-300">
                    {player.total_tournaments}
                  </td>
                  <td className="py-4 px-4 text-center font-bold text-amber-400">
                    {player.total_wins}
                  </td>
                  <td className="py-4 px-4 text-center text-cyanAccent-400 font-semibold">
                    {player.total_kills}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="font-black text-brand-400 text-sm">
                      {player.current_rating} PTS
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
