const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (character) => {
  if (character === '<') return '&lt;';
  if (character === '>') return '&gt;';
  if (character === '&') return '&amp;';
  if (character === "'") return '&apos;';
  return '&quot;';
});

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Creates a deterministic, locally rendered banner unique to each event slug. */
export function getTournamentBanner(game: string, seed: string, title: string = game) {
  const hash = hashText(`${game}:${seed}`);
  const hue = game === 'BGMI' ? 165 + (hash % 65) : 5 + (hash % 55);
  const secondaryHue = (hue + 82 + ((hash >>> 8) % 80)) % 360;
  const accent = `hsl(${hue} 75% 52%)`;
  const accentTwo = `hsl(${secondaryHue} 82% 58%)`;
  const safeTitle = escapeXml(title.slice(0, 54));
  const safeSeed = escapeXml(seed.slice(0, 42));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 720"><defs><linearGradient id="bg" x1="0" y1="0" x2="1440" y2="720" gradientUnits="userSpaceOnUse"><stop stop-color="#08111d"/><stop offset=".55" stop-color="${accent}"/><stop offset="1" stop-color="${accentTwo}"/></linearGradient><radialGradient id="flare"><stop stop-color="${accentTwo}" stop-opacity=".82"/><stop offset="1" stop-color="${accentTwo}" stop-opacity="0"/></radialGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0v48" fill="none" stroke="#fff" stroke-opacity=".12"/></pattern></defs><path fill="url(#bg)" d="M0 0h1440v720H0z"/><ellipse cx="${760 + (hash % 540)}" cy="230" rx="500" ry="340" fill="url(#flare)"/><path d="m0 490 150-115 125 95 145-200 155 177 130-115 130 133 150-188 160 150 120-110 175 111v292H0z" fill="#07101c" fill-opacity=".72"/><path d="M0 0h1440v720H0z" fill="url(#grid)"/><g fill="none" stroke="#fff" stroke-opacity=".44"><path d="M180 480v-118l66-34 65 36v116M218 480v-70h53v70M910 480V332l71-40 73 42v146M953 480v-88h57v88M500 510l54-184 62 184M480 458h156M1150 485l37-132 42 132M1137 447h104"/></g><path d="M72 77h290M72 93h190M1110 77h258M1200 93h168" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><text x="80" y="622" fill="#fff" font-family="Arial,sans-serif" font-size="44" font-weight="700" opacity=".86">${safeTitle}</text><text x="84" y="666" fill="#fff" font-family="Arial,sans-serif" font-size="16" letter-spacing="4" opacity=".68">${game.toUpperCase()} • ${safeSeed} • VYROX ARENA</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function isLegacyTournamentBanner(url: string | null | undefined) {
  return url === '/tournament-backgrounds/bgmi-arena.svg'
    || url === '/tournament-backgrounds/free-fire-arena.svg';
}
