'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ImagePlus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/services/store';
import { GameTitle, Profile } from '@/lib/supabase/types';
import { useAuth } from '@/lib/auth-context';

interface VerificationRow {
  id: string;
  player_id: string;
  game: GameTitle;
  game_ign: string;
  game_uid: string;
  screenshot_path: string;
  status: 'pending' | 'verified' | 'rejected';
  reviewer_note: string | null;
  submitted_at: string;
  screenshot_url?: string;
}

const statusStyle: Record<VerificationRow['status'], string> = {
  pending: 'text-amber-300',
  verified: 'text-emerald-300',
  rejected: 'text-rose-300',
};

export function GameIdScreenshotUpload({ game, ign, uid }: { game: GameTitle; ign: string; uid: string }) {
  const { currentUser } = useAuth();
  const user = currentUser;
  const [latest, setLatest] = useState<VerificationRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadLatest = useCallback(async () => {
    if (!user || !isSupabaseConfigured()) return;
    const { data } = await createClient().from('player_game_id_verifications')
      .select('id,status,reviewer_note,submitted_at')
      .eq('player_id', user.id).eq('game', game)
      .order('submitted_at', { ascending: false }).limit(1).maybeSingle();
    if (data) setLatest(data as VerificationRow);
  }, [game, user]);

  useEffect(() => { void loadLatest(); }, [loadLatest]);

  const submit = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    if (!user || !isSupabaseConfigured()) { setMessage('Connect your player account to submit verification.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setMessage('Choose a JPG, PNG, or WebP screenshot.'); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage('The screenshot must be 5 MB or smaller.'); return; }
    if (!ign.trim() || !uid.trim()) { setMessage('Enter and save this game name and player ID first.'); return; }

    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = `${user.id}/${game.replace(' ', '_')}/${Date.now()}.${extension}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from('game-id-verifications')
        .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      uploadedPath = path;
      const { data, error } = await supabase.rpc('submit_game_id_verification', {
        p_game: game,
        p_screenshot_path: path,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || 'Could not submit this screenshot.');
      uploadedPath = null;
      setMessage('Screenshot submitted. The organizer will review it against your saved game ID.');
      await loadLatest();
    } catch (error) {
      if (uploadedPath) await createClient().storage.from('game-id-verifications').remove([uploadedPath]);
      setMessage(error instanceof Error ? error.message : 'Could not upload the screenshot. Apply migration 007 and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sm:col-span-2 rounded-xl border border-surface-border bg-surface-100/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-white">Verify {game} ID with a screenshot</div>
          <p className="mt-1 text-[11px] text-gray-400">Upload a clear in-game profile screenshot showing the same name and player ID above. Only you and organizers can view it.</p>
        </div>
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-surface-border bg-surface-200 px-3 py-2 text-xs font-bold text-white hover:border-cyanAccent-400 ${busy || latest?.status === 'pending' ? 'pointer-events-none opacity-50' : ''}`}>
          <ImagePlus className="h-4 w-4" /> {busy ? 'Uploading…' : latest?.status === 'pending' ? 'Under review' : 'Upload screenshot'}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={submit} disabled={busy || latest?.status === 'pending'} className="sr-only" />
        </label>
      </div>
      {latest && <p className={`mt-2 flex items-center gap-1.5 text-[11px] ${statusStyle[latest.status]}`}>
        {latest.status === 'pending' ? <Clock3 className="h-3.5 w-3.5" /> : latest.status === 'verified' ? <ShieldCheck className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        Latest submission: {latest.status}{latest.reviewer_note ? ` · ${latest.reviewer_note}` : ''}
      </p>}
      {message && <p role="status" className="mt-2 text-[11px] text-cyanAccent-300">{message}</p>}
    </div>
  );
}

export function GameIdVerificationInbox({ players }: { players: Profile[] }) {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadRows = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const { data, error: queryError } = await supabase.from('player_game_id_verifications')
      .select('*').order('submitted_at', { ascending: false }).limit(200);
    if (queryError) { setError(`Could not load verification submissions: ${queryError.message}. Apply migration 007.`); return; }
    const enriched = await Promise.all((data || []).map(async (row) => {
      const { data: signed } = await supabase.storage.from('game-id-verifications').createSignedUrl(row.screenshot_path, 600);
      return { ...row, screenshot_url: signed?.signedUrl } as VerificationRow;
    }));
    setRows(enriched);
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const review = async (row: VerificationRow, status: 'verified' | 'rejected') => {
    const note = status === 'rejected' ? window.prompt('Reason for rejecting this screenshot (optional):') : '';
    if (note === null) return;
    setBusyId(row.id);
    setError('');
    try {
      const { data, error: reviewError } = await createClient().rpc('review_game_id_verification', {
        p_verification_id: row.id, p_status: status, p_note: note,
      });
      if (reviewError) throw reviewError;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || 'Review could not be saved.');
      await loadRows();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Could not save the review.');
    } finally {
      setBusyId('');
    }
  };

  const deleteRejected = async (row: VerificationRow) => {
    if (!window.confirm(`Delete the rejected ${row.game} ID screenshot and submission for ${row.game_ign}?`)) return;
    setBusyId(row.id);
    setError('');
    try {
      const response = await fetch('/api/admin/game-id-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId: row.id }),
      });
      const result = await response.json() as { success?: boolean; error?: string; warning?: string };
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not delete the rejected submission.');
      setRows((current) => current.filter((item) => item.id !== row.id));
      if (result.warning) setError(result.warning);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the rejected submission.');
    } finally {
      setBusyId('');
    }
  };

  const playerById = new Map(players.map((player) => [player.id, player]));
  return (
    <section className="space-y-4 rounded-2xl border border-surface-border bg-surface-100 p-5">
      <div>
        <h3 className="font-display text-lg font-bold text-white">In-game ID verification</h3>
        <p className="mt-1 text-xs text-gray-400">Check the screenshot against the player’s saved IGN and UID. Submissions stay private to that player and organizers.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</p>}
      {rows.length === 0 ? <p className="text-sm text-gray-500">No screenshots have been submitted.</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((row) => {
            const player = playerById.get(row.player_id);
            return <article key={row.id} className="grid gap-4 rounded-xl border border-surface-border bg-surface-200/50 p-4 sm:grid-cols-[180px_1fr]">
              {row.screenshot_url ? <a href={row.screenshot_url} target="_blank" rel="noreferrer"><img src={row.screenshot_url} alt={`${row.game} ID screenshot for ${player?.display_name || row.game_ign}`} className="h-40 w-full rounded-lg border border-surface-border bg-black object-contain" /></a> : <div className="flex h-40 items-center justify-center rounded-lg bg-surface-200 text-xs text-gray-500">Screenshot unavailable</div>}
              <div className="space-y-2 text-xs">
                <div className="font-bold text-white">{player?.display_name || 'Deleted account'} <span className="font-normal text-gray-400">@{player?.username || 'unknown'}</span></div>
                <div className="font-mono text-cyanAccent-300">{row.game} · {row.game_ign} · ID {row.game_uid}</div>
                <div className="text-gray-400">Submitted {new Date(row.submitted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>
                <div className={`font-bold uppercase ${statusStyle[row.status]}`}>Status: {row.status}</div>
                {row.reviewer_note && <p className="text-gray-300">Review note: {row.reviewer_note}</p>}
                {row.status === 'pending' && <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" disabled={busyId === row.id} onClick={() => void review(row, 'verified')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Verify</button>
                  <button type="button" disabled={busyId === row.id} onClick={() => void review(row, 'rejected')} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-950 px-3 py-2 font-bold text-rose-200 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject</button>
                </div>}
                {row.status === 'rejected' && <button type="button" disabled={busyId === row.id} onClick={() => void deleteRejected(row)} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-950 px-3 py-2 font-bold text-rose-200 disabled:opacity-50"><Trash2 className="h-4 w-4" /> {busyId === row.id ? 'Deleting…' : 'Delete rejected submission'}</button>}
              </div>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
