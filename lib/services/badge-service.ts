export interface CompetitiveBadge {
  id: string;
  name: string;
  ratingRequired: number;
  icon: string;
  accent: string;
}

export const COMPETITIVE_BADGES: CompetitiveBadge[] = [
  { id: 'rookie', name: 'Rookie', ratingRequired: 1100, icon: '🎮', accent: 'border-slate-400/40 bg-slate-400/10 text-slate-200' },
  { id: 'contender', name: 'Contender', ratingRequired: 1250, icon: '⚡', accent: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' },
  { id: 'veteran', name: 'Veteran', ratingRequired: 1400, icon: '🛡️', accent: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' },
  { id: 'elite', name: 'Elite', ratingRequired: 1600, icon: '🔥', accent: 'border-orange-400/40 bg-orange-400/10 text-orange-200' },
  { id: 'champion', name: 'Champion', ratingRequired: 1800, icon: '🏆', accent: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  { id: 'legend', name: 'Legend', ratingRequired: 2000, icon: '👑', accent: 'border-violet-400/40 bg-violet-400/10 text-violet-200' },
];

export function getUnlockedBadges(rating: number) {
  return COMPETITIVE_BADGES.filter((badge) => rating >= badge.ratingRequired);
}

export function getNextBadge(rating: number) {
  return COMPETITIVE_BADGES.find((badge) => rating < badge.ratingRequired) || null;
}
