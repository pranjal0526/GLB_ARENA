'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Link2, Share2, X } from 'lucide-react';

export interface LeaderboardStoryData {
  kind: 'player' | 'team';
  name: string;
  handle?: string;
  game?: string;
  rank?: number;
  rating: number;
  peakRating: number;
  events: number;
  wins: number;
  kills: number;
  badgeName?: string;
  badgeIcon?: string;
  badgeUnlocked?: boolean;
  badgeThreshold?: number;
  shareUrl: string;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number, minSize = 30) {
  let size = maxSize;
  do {
    ctx.font = `800 ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
    size -= 2;
  } while (size > minSize);
  return size;
}

function drawStoryCard(data: LeaderboardStoryData) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const background = ctx.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, '#080a12');
  background.addColorStop(0.55, '#111326');
  background.addColorStop(1, '#07141b');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1080, 1920);

  const glow = ctx.createRadialGradient(860, 300, 30, 860, 300, 650);
  glow.addColorStop(0, 'rgba(124, 58, 237, 0.36)');
  glow.addColorStop(1, 'rgba(124, 58, 237, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1000);
  const lowerGlow = ctx.createRadialGradient(160, 1560, 10, 160, 1560, 520);
  lowerGlow.addColorStop(0, 'rgba(6, 182, 212, 0.22)');
  lowerGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
  ctx.fillStyle = lowerGlow;
  ctx.fillRect(0, 1050, 760, 870);

  roundedRect(ctx, 42, 42, 996, 1836, 48);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 52px Arial, sans-serif';
  ctx.fillText('VYROX', 92, 139);
  ctx.fillStyle = '#22d3ee';
  ctx.font = '700 20px Arial, sans-serif';
  ctx.fillText('ESPORTS INDIA', 96, 172);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a5b4fc';
  ctx.font = '700 19px Arial, sans-serif';
  ctx.fillText('COMPETITIVE RANKINGS', 986, 137);
  ctx.fillStyle = 'rgba(148,163,184,0.28)';
  ctx.fillRect(92, 208, 896, 2);
  ctx.textAlign = 'left';

  const title = data.rank ? `${data.kind === 'team' ? 'TEAM' : 'PLAYER'} LEADERBOARD` : 'PLAYER PROFILE';
  roundedRect(ctx, 92, 258, 480, 56, 28);
  ctx.fillStyle = 'rgba(34,211,238,0.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(34,211,238,0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#67e8f9';
  ctx.font = '700 21px Arial, sans-serif';
  ctx.fillText(title, 118, 294);

  ctx.fillStyle = '#a78bfa';
  ctx.font = '800 30px Arial, sans-serif';
  ctx.fillText(data.rank ? `RANK  #${String(data.rank).padStart(2, '0')}` : 'VYROX ACHIEVEMENT CARD', 94, 400);
  ctx.fillStyle = '#ffffff';
  const nameSize = fitText(ctx, data.name, 880, 76, 42);
  ctx.font = `900 ${nameSize}px Arial, sans-serif`;
  ctx.fillText(data.name, 90, 500, 900);

  const subtitle = data.kind === 'player' ? (data.handle ? `@${data.handle}` : 'VYROX PLAYER') : `${data.game || 'ESPORTS'} TEAM`;
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '600 27px Arial, sans-serif';
  ctx.fillText(subtitle, 96, 548, 850);

  roundedRect(ctx, 92, 620, 896, 370, 32);
  ctx.fillStyle = 'rgba(15, 18, 31, 0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#9ca3af';
  ctx.font = '700 22px Arial, sans-serif';
  ctx.fillText('CURRENT VYROX RATING', 132, 684);
  ctx.fillStyle = '#c4b5fd';
  ctx.font = '900 148px Arial, sans-serif';
  ctx.fillText(String(data.rating), 124, 850, 800);
  ctx.fillStyle = '#22d3ee';
  ctx.font = '700 25px Arial, sans-serif';
  ctx.fillText(`PEAK ${data.peakRating} PTS`, 136, 927);

  const stats = [
    { label: 'EVENTS', value: data.events, color: '#e5e7eb' },
    { label: 'WINS', value: data.wins, color: '#fbbf24' },
    { label: 'KILLS', value: data.kills, color: '#22d3ee' },
  ];
  stats.forEach((stat, index) => {
    const x = 92 + index * 306;
    roundedRect(ctx, x, 1030, 284, 216, 26);
    ctx.fillStyle = 'rgba(15,18,31,0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = stat.color;
    ctx.font = '900 70px Arial, sans-serif';
    ctx.fillText(String(stat.value), x + 26, 1136, 230);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '700 19px Arial, sans-serif';
    ctx.fillText(stat.label, x + 28, 1195);
  });

  roundedRect(ctx, 92, 1290, 896, 270, 32);
  ctx.fillStyle = 'rgba(15,18,31,0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(251,191,36,0.38)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#9ca3af';
  ctx.font = '700 20px Arial, sans-serif';
  ctx.fillText(data.badgeUnlocked ? 'PEAK RATING BADGE' : 'NEXT BADGE GOAL', 132, 1348);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '64px Arial, sans-serif';
  ctx.fillText(data.badgeIcon || '🔒', 128, 1440);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px Arial, sans-serif';
  ctx.fillText(data.badgeName || 'Keep competing', 220, 1417, 720);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '500 22px Arial, sans-serif';
  const badgeStatus = data.badgeUnlocked
    ? 'Achievement unlocked on VYROX'
    : `Unlock at ${data.badgeThreshold ?? 1100} rating points`;
  ctx.fillText(badgeStatus, 222, 1462, 720);

  ctx.fillStyle = '#22d3ee';
  ctx.font = '800 25px Arial, sans-serif';
  ctx.fillText('VIEW THE LIVE LEADERBOARD', 94, 1660);
  let host = 'VYROX';
  try { host = new URL(data.shareUrl).host; } catch { /* Keep the brand fallback. */ }
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '600 25px Arial, sans-serif';
  ctx.fillText(`${host}/leaderboard`, 94, 1705, 890);
  ctx.fillStyle = '#71717a';
  ctx.font = '500 19px Arial, sans-serif';
  ctx.fillText('Add the copied URL as an Instagram Link sticker', 94, 1795, 890);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a78bfa';
  ctx.font = '700 19px Arial, sans-serif';
  ctx.fillText('BGMI  •  FREE FIRE', 986, 1835);

  return canvas.toDataURL('image/png');
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player';
}

export function LeaderboardShareDialog({ data, onClose }: { data: LeaderboardStoryData; onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [message, setMessage] = useState('');
  const localLink = useMemo(() => {
    try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(data.shareUrl).hostname); }
    catch { return false; }
  }, [data.shareUrl]);

  useEffect(() => {
    setImageUrl(drawStoryCard(data));
  }, [data]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setMessage('Leaderboard link copied. Paste it into Instagram’s Link sticker.');
    } catch {
      setMessage('Copy failed. Select the URL below and copy it manually.');
    }
  };

  const shareImage = async () => {
    if (!imageUrl || typeof File === 'undefined') return;
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], `vyrox-${slugify(data.name)}-story.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          title: `${data.name} · VYROX`,
          text: `View ${data.name} on the live VYROX leaderboard: ${data.shareUrl}`,
          files: [file],
        });
      } else {
        setMessage('Image sharing is unavailable here. Download the card, then use the copied URL in Instagram’s Link sticker.');
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setMessage('Could not open the share sheet. Download the image and copy the link below.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="story-dialog-title" className="relative grid max-h-[92vh] w-full max-w-4xl gap-5 overflow-y-auto rounded-3xl border border-surface-border bg-surface-100 p-5 shadow-2xl md:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)] md:p-7">
        <button type="button" onClick={onClose} aria-label="Close story card" className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 hover:bg-surface-200 hover:text-white"><X className="h-5 w-5" /></button>
        <div className="flex min-h-0 justify-center rounded-2xl bg-black/40 p-3">
          {imageUrl ? <img src={imageUrl} alt={`Instagram story card for ${data.name}`} className="max-h-[72vh] w-auto rounded-xl object-contain" /> : <div className="aspect-[9/16] animate-pulse rounded-xl bg-surface-200" />}
        </div>
        <div className="flex flex-col justify-center gap-4 pt-8 md:pt-2">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-cyanAccent-300">Instagram story card</p>
            <h2 id="story-dialog-title" className="mt-2 text-2xl font-display font-bold text-white">Share {data.name}</h2>
            <p className="mt-2 text-sm text-gray-400">Download this 1080 × 1920 image for your story. Copy the live leaderboard URL and add it with Instagram’s Link sticker so people can open the ranking.</p>
          </div>
          <a href={imageUrl || undefined} download={`vyrox-${slugify(data.name)}-story.png`} aria-disabled={!imageUrl}
            className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 px-4 py-3 text-sm font-bold text-white ${imageUrl ? 'hover:brightness-110' : 'pointer-events-none opacity-50'}`}>
            <Download className="h-4 w-4" /> Download story card (PNG)
          </a>
          <button type="button" onClick={() => void shareImage()} disabled={!imageUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-200 px-4 py-3 text-sm font-bold text-white hover:border-cyanAccent-400 disabled:opacity-50">
            <Share2 className="h-4 w-4" /> Share image and link
          </button>
          <div className="space-y-2">
            <label htmlFor="story-share-url" className="block text-xs font-mono uppercase text-gray-400">Live leaderboard link</label>
            <div className="flex gap-2">
              <input id="story-share-url" readOnly value={data.shareUrl} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-xl border border-surface-border bg-surface-200 px-3 py-2.5 text-xs text-gray-200" />
              <button type="button" onClick={() => void copyLink()} aria-label="Copy leaderboard link" className="rounded-xl border border-surface-border bg-surface-200 px-3 text-cyanAccent-300 hover:text-white"><Copy className="h-4 w-4" /></button>
              <a href={data.shareUrl} target="_blank" rel="noreferrer" aria-label="Open leaderboard link" className="rounded-xl border border-surface-border bg-surface-200 px-3 py-2.5 text-gray-300 hover:text-white"><ExternalLink className="h-4 w-4" /></a>
            </div>
          </div>
          {localLink && <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200"><Link2 className="mr-1 inline h-3.5 w-3.5" />This is a local development link and won’t open for Instagram viewers. Deploy the site and set <code>NEXT_PUBLIC_SITE_URL</code> to its public URL before sharing.</p>}
          {message && <p role="status" className="flex items-center gap-2 text-xs text-emerald-300"><Check className="h-4 w-4" />{message}</p>}
        </div>
      </section>
    </div>
  );
}
