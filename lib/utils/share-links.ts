function isLocalUrl(value: string) {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function getShareOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  const currentOrigin = typeof window === 'undefined' ? '' : window.location.origin;

  // Use the actual dev-server port locally. In production, prefer the public
  // origin configured by the site owner so shared links do not point at localhost.
  if (configured && !isLocalUrl(configured)) return configured;
  return currentOrigin || configured || 'http://localhost:3000';
}

export function buildLeaderboardShareUrl(target: { player?: string; teamId?: string }) {
  const params = new URLSearchParams();
  if (target.player) params.set('player', target.player);
  if (target.teamId) params.set('teamId', target.teamId);
  return `${getShareOrigin()}/leaderboard?${params.toString()}`;
}
