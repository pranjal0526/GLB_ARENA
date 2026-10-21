'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Share2, Trophy, Users, Zap } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { Profile, Team } from '@/lib/supabase/types';
import { getLeaderboard, getTeamLeaderboard } from '@/lib/services/profile-service';
import { getNextBadge, getUnlockedBadges } from '@/lib/services/badge-service';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/services/store';
import { LeaderboardStoryData, LeaderboardShareDialog } from '@/components/leaderboard-share-dialog';
import { buildLeaderboardShareUrl } from '@/lib/utils/share-links';

type RankingType = 'players' | 'teams';

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rankingType, setRankingType] = useState<RankingType>('players');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareTarget, setShareTarget] = useState<{ kind: 'player' | 'team'; id: string } | null>(null);
  const [storyData, setStoryData] = useState<LeaderboardStoryData | null>(null);

  const loadRankings = useCallback(async () => {
    try {
      const [playerRows, teamRows] = await Promise.all([getLeaderboard(), getTeamLeaderboard()]);
      setPlayers(playerRows);
      setTeams(teamRows);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load rankings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('teamId')) {
      setRankingType('teams');
      setShareTarget({ kind: 'team', id: params.get('teamId') || '' });
    } else if (params.has('team')) {
      setRankingType('teams');
      setSearch(params.get('team') || '');
    } else if (params.has('player')) {
      setSearch(params.get('player') || '');
      setShareTarget({ kind: 'player', id: params.get('player') || '' });
    }
    void loadRankings();
    const refresh = () => { if (document.visibilityState === 'visible') void loadRankings(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('vyrox_store_updated', refresh);
    const supabase = isSupabaseConfigured() ? createClient() : null;
    const channel = supabase?.channel('rankings-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, refresh)
      .subscribe();
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('vyrox_store_updated', refresh);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [loadRankings]);

  const filteredPlayers = useMemo(() => {
    if (shareTarget?.kind === 'player') return players.filter((player) => player.username.toLowerCase() === shareTarget.id.toLowerCase());
    const query = search.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => [player.display_name, player.username, player.bgmi_ign, player.free_fire_ign]
      .some((value) => value?.toLowerCase().includes(query)));
  }, [players, search, shareTarget]);

  const filteredTeams = useMemo(() => {
    if (shareTarget?.kind === 'team') return teams.filter((team) => team.id === shareTarget.id);
    const query = search.trim().toLowerCase();
    if (!query) return teams;
    return teams.filter((team) => `${team.name} ${team.game}`.toLowerCase().includes(query));
  }, [teams, search, shareTarget]);

  const sharePlayer = (player: Profile) => {
    const peakRating = player.highest_rating ?? player.current_rating;
    const badge = getUnlockedBadges(peakRating).at(-1);
    const nextBadge = getNextBadge(peakRating);
    setStoryData({
      kind: 'player', name: player.display_name, handle: player.username,
      rank: players.findIndex((row) => row.id === player.id) + 1,
      rating: player.current_rating, peakRating: player.highest_rating ?? player.current_rating,
      events: player.total_tournaments, wins: player.total_wins, kills: player.total_kills,
      badgeName: badge?.name || nextBadge?.name, badgeIcon: badge?.icon || nextBadge?.icon,
      badgeUnlocked: Boolean(badge), badgeThreshold: badge?.ratingRequired || nextBadge?.ratingRequired,
      shareUrl: buildLeaderboardShareUrl({ player: player.username }),
    });
  };

  const shareTeam = (team: Team) => {
    const rank = teams.findIndex((row) => row.id === team.id) + 1;
    const badge = getUnlockedBadges(team.highest_rating).at(-1);
    const nextBadge = getNextBadge(team.highest_rating);
    setStoryData({
      kind: 'team', name: team.name, game: team.game, rank,
      rating: team.current_rating, peakRating: team.highest_rating,
      events: team.tournaments_played, wins: team.total_wins, kills: team.total_kills,
      badgeName: badge?.name || nextBadge?.name, badgeIcon: badge?.icon || nextBadge?.icon,
      badgeUnlocked: Boolean(badge), badgeThreshold: badge?.ratingRequired || nextBadge?.ratingRequired,
      shareUrl: buildLeaderboardShareUrl({ teamId: team.id }),
    });
  };

  const rows = rankingType === 'players' ? filteredPlayers : filteredTeams;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <header className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-400">
          <Trophy className="w-3.5 h-3.5" /> OFFICIAL COMPETITIVE RANKINGS
        </div>
        <h1 className="text-3xl sm:text-5xl font-display font-black text-white uppercase tracking-tight">BGMI &amp; Free Fire Leaderboards</h1>
        <p className="text-sm text-gray-400 leading-relaxed">Individual player ratings and persistent team standings update when admins finalize match results.</p>
      </header>

      <div className="flex justify-center">
        <div className="inline-flex gap-2 p-1.5 rounded-2xl bg-surface-100 border border-surface-border" role="tablist" aria-label="Leaderboard type">
          <button type="button" role="tab" aria-selected={rankingType === 'players'} onClick={() => { setRankingType('players'); setSearch(''); setShareTarget(null); }}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${rankingType === 'players' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Zap className="w-4 h-4" /> Individual Players <span className="font-mono opacity-75">{players.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={rankingType === 'teams'} onClick={() => { setRankingType('teams'); setSearch(''); setShareTarget(null); }}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${rankingType === 'teams' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Users className="w-4 h-4" /> Teams <span className="font-mono opacity-75">{teams.length}</span>
          </button>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-surface-100 border border-surface-border">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShareTarget(null); }}
            placeholder={rankingType === 'players' ? 'Search by player name, username, or in-game name…' : 'Search teams by name or game…'}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      </div>

      {error && <p role="status" className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</p>}

      <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase text-gray-400 font-mono">
              {rankingType === 'players' ? <tr>
                <th className="py-4 px-4 text-center">Rank</th><th className="py-4 px-4">Player</th><th className="py-4 px-4">In-game identity</th>
                <th className="py-4 px-4 text-center">Events</th><th className="py-4 px-4 text-center">Wins</th><th className="py-4 px-4 text-center">Kills</th><th className="py-4 px-4 text-right">Rating</th><th className="py-4 px-4 text-right">Share</th>
              </tr> : <tr>
                <th className="py-4 px-4 text-center">Rank</th><th className="py-4 px-4">Team</th><th className="py-4 px-4">Game</th>
                <th className="py-4 px-4 text-center">Events</th><th className="py-4 px-4 text-center">Wins</th><th className="py-4 px-4 text-center">Kills</th><th className="py-4 px-4 text-right">Rating</th><th className="py-4 px-4 text-right">Share</th>
              </tr>}
            </thead>
            <tbody className="divide-y divide-surface-border text-xs">
              {rankingType === 'players' && filteredPlayers.map((player) => {
                const badges = getUnlockedBadges(player.highest_rating ?? player.current_rating);
                const rank = players.findIndex((row) => row.id === player.id) + 1;
                return <tr key={player.id} className="hover:bg-surface-50/50">
                  <td className="py-4 px-4 text-center"><span className="inline-flex min-w-8 h-8 px-1 items-center justify-center rounded-full bg-brand-900/70 text-brand-200 font-mono font-bold">#{rank}</span></td>
                  <td className="py-4 px-4"><div className="flex items-center gap-3"><Avatar name={player.display_name} avatarUrl={player.avatar_url} className="w-9 h-9 text-sm" /><div><div className="font-semibold text-white text-sm">{player.display_name}</div><div className="text-gray-400">@{player.username}</div></div></div></td>
                  <td className="py-4 px-4"><div className="text-cyanAccent-400 font-bold">BGMI: {player.bgmi_ign || '—'} <span className="text-gray-500">{player.bgmi_uid || ''}</span></div><div className="text-orange-300">Free Fire: {player.free_fire_ign || '—'} <span className="text-gray-500">{player.free_fire_uid || ''}</span></div></td>
                  <td className="py-4 px-4 text-center text-gray-300">{player.total_tournaments}</td><td className="py-4 px-4 text-center font-bold text-amber-400">{player.total_wins}</td><td className="py-4 px-4 text-center text-cyanAccent-400 font-semibold">{player.total_kills}</td>
                  <td className="py-4 px-4 text-right"><span className="font-black text-brand-300 text-sm">{player.current_rating} PTS</span>{badges.length > 0 && <div className="text-[10px] text-amber-300 mt-1">{badges.at(-1)?.icon} {badges.at(-1)?.name}</div>}</td>
                  <td className="py-4 px-4 text-right"><button type="button" onClick={() => sharePlayer(player)} aria-label={`Create Instagram story card for ${player.display_name}`} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-200"><Share2 className="w-4 h-4" /></button></td>
                </tr>;
              })}
              {rankingType === 'teams' && filteredTeams.map((team) => {
                const badges = getUnlockedBadges(team.highest_rating);
                const rank = teams.findIndex((row) => row.id === team.id) + 1;
                return <tr key={team.id} className="hover:bg-surface-50/50">
                  <td className="py-4 px-4 text-center"><span className="inline-flex min-w-8 h-8 px-1 items-center justify-center rounded-full bg-brand-900/70 text-brand-200 font-mono font-bold">#{rank}</span></td>
                  <td className="py-4 px-4"><div className="font-semibold text-white text-sm flex items-center gap-2"><span className="w-9 h-9 rounded-xl bg-surface-200 border border-surface-border flex items-center justify-center"><Users className="w-4 h-4 text-cyanAccent-300" /></span>{team.name}</div></td>
                  <td className="py-4 px-4 text-gray-300">{team.game}</td><td className="py-4 px-4 text-center text-gray-300">{team.tournaments_played}</td><td className="py-4 px-4 text-center font-bold text-amber-400">{team.total_wins}</td><td className="py-4 px-4 text-center text-cyanAccent-400 font-semibold">{team.total_kills}</td>
                  <td className="py-4 px-4 text-right"><span className="font-black text-brand-300 text-sm">{team.current_rating} PTS</span>{badges.length > 0 && <div className="text-[10px] text-amber-300 mt-1">{badges.at(-1)?.icon} {badges.at(-1)?.name}</div>}</td>
                  <td className="py-4 px-4 text-right"><button type="button" onClick={() => shareTeam(team)} aria-label={`Create Instagram story card for ${team.name}`} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-200"><Share2 className="w-4 h-4" /></button></td>
                </tr>;
              })}
              {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="py-12 px-4 text-center text-gray-400">{rankingType === 'players' ? 'No players match this search.' : 'No team results yet. Team rankings appear after a multi-player match is finalized.'}</td></tr>}
              {isLoading && <tr><td colSpan={8} className="py-12 px-4 text-center text-gray-400">Loading rankings…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && rankingType === 'players' && filteredPlayers.length > 0 && <p className="text-xs text-gray-500 text-center">Badges use peak rating, so unlocked achievements stay on the profile if rating changes later.</p>}
      {storyData && <LeaderboardShareDialog data={storyData} onClose={() => setStoryData(null)} />}
    </div>
  );
}
