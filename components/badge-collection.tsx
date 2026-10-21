'use client';

import { useState } from 'react';
import { Award, Lock, Share2 } from 'lucide-react';
import { COMPETITIVE_BADGES, CompetitiveBadge, getNextBadge, getUnlockedBadges } from '@/lib/services/badge-service';
import { buildLeaderboardShareUrl } from '@/lib/utils/share-links';
import { LeaderboardStoryData, LeaderboardShareDialog } from '@/components/leaderboard-share-dialog';

export function BadgeCollection({ displayName, username, rating, currentRating = rating, shareUrl, events = 0, wins = 0, kills = 0 }: {
  displayName: string;
  username: string;
  rating: number;
  currentRating?: number;
  shareUrl: string;
  events?: number;
  wins?: number;
  kills?: number;
}) {
  const next = getNextBadge(rating);
  const [storyData, setStoryData] = useState<LeaderboardStoryData | null>(null);

  const shareBadge = (badge?: CompetitiveBadge) => {
    const unlockedBadge = badge || getUnlockedBadges(rating).at(-1);
    const nextBadge = getNextBadge(rating);
    setStoryData({
      kind: 'player',
      name: displayName,
      handle: username,
      rank: undefined,
      rating: currentRating,
      peakRating: rating,
      events,
      wins,
      kills,
      badgeName: unlockedBadge?.name || nextBadge?.name,
      badgeIcon: unlockedBadge?.icon || nextBadge?.icon,
      badgeUnlocked: Boolean(unlockedBadge),
      badgeThreshold: unlockedBadge?.ratingRequired || nextBadge?.ratingRequired,
      shareUrl: shareUrl || buildLeaderboardShareUrl({ player: username }),
    });
  };

  return (
    <section className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-white text-lg flex items-center gap-2"><Award className="w-5 h-5 text-amber-300" /> Achievements</h2>
          <p className="text-xs text-gray-400 mt-1">Every badge and its unlock target is shown below. Badges unlock permanently when your peak rating reaches the threshold.</p>
        </div>
        <div className="flex items-center gap-3">
          {next && <span className="text-xs font-mono text-gray-300">Next: {next.name} at {next.ratingRequired} pts</span>}
          <button type="button" onClick={() => shareBadge()} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-200 px-3 py-2 text-xs font-bold text-white hover:border-cyanAccent-400">
            <Share2 className="h-3.5 w-3.5" /> Create story card
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COMPETITIVE_BADGES.map((badge) => {
          const unlocked = rating >= badge.ratingRequired;
          return (
            <article key={badge.id} className={`relative rounded-2xl border p-3 ${unlocked ? badge.accent : 'border-surface-border bg-surface-200/40 text-gray-500'}`}>
              {!unlocked && <Lock className="absolute right-3 top-3 h-4 w-4" aria-label="Locked" />}
              <div className={`text-2xl ${unlocked ? '' : 'grayscale opacity-40'}`} aria-hidden="true">{badge.icon}</div>
              <div className="mt-1 text-sm font-bold">{badge.name}</div>
              <div className="font-mono text-[10px] opacity-80">Unlock at {badge.ratingRequired.toLocaleString('en-IN')} pts</div>
              <div className={`mt-1 text-[9px] font-bold uppercase tracking-wide ${unlocked ? 'text-emerald-300' : 'text-gray-500'}`}>
                {unlocked ? 'Unlocked' : `${Math.max(0, badge.ratingRequired - rating).toLocaleString('en-IN')} pts to go`}
              </div>
              {unlocked && <button type="button" onClick={() => shareBadge(badge)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase hover:underline">
                <Share2 className="h-3 w-3" /> Story card
              </button>}
            </article>
          );
        })}
      </div>
      {storyData && <LeaderboardShareDialog data={storyData} onClose={() => setStoryData(null)} />}
    </section>
  );
}
