'use client';

import React, { useEffect, useState } from 'react';

interface PlayerHistory {
  contact: { phone_number: string; created_at: string; updated_at: string } | null;
  auth: { email: string | null; created_at: string; last_sign_in_at: string | null; providers: string[] };
  profile: { id: string; created_at: string; updated_at: string; current_rating: number; highest_rating?: number; total_tournaments: number; total_wins: number; total_kills: number; account_status: string; ban_reason?: string | null };
  ratings: Array<{ id: string; description: string; previous_rating: number; rating_change: number; new_rating: number; created_at: string; match_id?: string | null; tournament_id?: string | null }>;
  registrations: Array<{ id: string; team_name?: string | null; registration_code: string; status: string; slot_number?: number | null; created_at: string; tournament?: { title: string; status: string } | null }>;
  team_entries: Array<{ id: string; ign: string; uid: string; role: string; created_at: string; registration?: { team_name?: string | null; status: string; tournament?: { title: string; status: string } | null } | null }>;
  verifications: Array<{ id: string; game: string; game_ign: string; game_uid: string; status: string; reviewer_note?: string | null; submitted_at: string }>;
  profile_events: Array<{ id: string; event_type: string; changed_fields: string[]; before_values?: Record<string, unknown> | null; after_values: Record<string, unknown>; created_at: string }>;
  audit_events: Array<{ id: string; action: string; created_at: string; metadata: Record<string, unknown> }>;
}

const dateText = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'Never';

export function PlayerAccountDetails({ playerId }: { playerId: string }) {
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    void fetch(`/api/admin/player-account?id=${encodeURIComponent(playerId)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load the player record.');
        if (mounted) setHistory(payload as PlayerHistory);
      })
      .catch((requestError) => { if (mounted) setError(requestError instanceof Error ? requestError.message : 'Could not load the player record.'); });
    return () => { mounted = false; };
  }, [playerId]);

  if (error) return <p role="alert" className="rounded-xl bg-rose-950/40 p-4 text-xs text-rose-300">{error}</p>;
  if (!history) return <p className="p-4 text-xs text-gray-400">Loading full account history…</p>;

  return <div className="space-y-5 rounded-xl border border-surface-border bg-surface-200/40 p-4 text-xs">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div><div className="text-gray-500">Account ID</div><div className="mt-1 break-all font-mono text-gray-200">{history.profile.id}</div></div>
      <div><div className="text-gray-500">Sign-in email</div><div className="mt-1 text-gray-200">{history.auth.email || 'Not available'}</div></div>
      <div><div className="text-gray-500">Phone number</div><div className="mt-1 text-gray-200">{history.contact?.phone_number || 'Not added'}</div></div>
      <div><div className="text-gray-500">Account created</div><div className="mt-1 text-gray-200">{dateText(history.auth.created_at)}</div></div>
      <div><div className="text-gray-500">Last sign-in</div><div className="mt-1 text-gray-200">{dateText(history.auth.last_sign_in_at)}</div></div>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-gray-300">
      <span>Providers: {history.auth.providers.join(', ') || 'email'}</span>
      <span>Rating: {history.profile.current_rating} (peak {history.profile.highest_rating ?? history.profile.current_rating})</span>
      <span>Tournaments: {history.profile.total_tournaments}</span>
      <span>Wins: {history.profile.total_wins}</span>
      <span>Kills: {history.profile.total_kills}</span>
      <span>Last profile change: {dateText(history.profile.updated_at)}</span>
    </div>

    <section><h4 className="mb-2 font-bold text-white">Tournament entries ({history.registrations.length})</h4>
      {history.registrations.length ? <ul className="space-y-1 text-gray-300">{history.registrations.map((entry) => <li key={entry.id}>{dateText(entry.created_at)} · {entry.tournament?.title || 'Deleted event'} · {entry.team_name || 'Solo entry'} · {entry.status} · {entry.registration_code}</li>)}</ul> : <p className="text-gray-500">No captain entries.</p>}
      {history.team_entries.length > 0 && <ul className="mt-2 space-y-1 text-gray-300">{history.team_entries.map((entry) => <li key={entry.id}>{dateText(entry.created_at)} · {entry.registration?.tournament?.title || 'Tournament'} · {entry.registration?.team_name || 'Squad'} · {entry.ign} (ID {entry.uid}) · {entry.registration?.status}</li>)}</ul>}
    </section>

    <section><h4 className="mb-2 font-bold text-white">Rating history ({history.ratings.length})</h4>
      {history.ratings.length ? <ol className="max-h-48 space-y-1 overflow-y-auto text-gray-300">{history.ratings.map((event) => <li key={event.id}>{dateText(event.created_at)} · {event.description}: {event.previous_rating} {event.rating_change >= 0 ? '+' : ''}{event.rating_change} = {event.new_rating}</li>)}</ol> : <p className="text-gray-500">No match rating changes.</p>}
    </section>

    <section><h4 className="mb-2 font-bold text-white">Game ID checks ({history.verifications.length})</h4>
      {history.verifications.length ? <ul className="space-y-1 text-gray-300">{history.verifications.map((record) => <li key={record.id}>{dateText(record.submitted_at)} · {record.game}: {record.game_ign} / {record.game_uid} · {record.status}{record.reviewer_note ? ` · ${record.reviewer_note}` : ''}</li>)}</ul> : <p className="text-gray-500">No ID screenshot submissions.</p>}
    </section>

    <section><h4 className="mb-2 font-bold text-white">Profile history ({history.profile_events.length})</h4>
      {history.profile_events.length ? <ol className="max-h-48 space-y-1 overflow-y-auto text-gray-300">{history.profile_events.map((event) => <li key={event.id}>{dateText(event.created_at)} · {event.event_type === 'created' ? 'Account profile created' : event.event_type === 'tracking_started' ? 'History tracking started' : `Updated: ${event.changed_fields.join(', ')}`} · {event.before_values ? `${JSON.stringify(event.before_values)} → ` : ''}{JSON.stringify(event.after_values)}</li>)}</ol> : <p className="text-gray-500">No profile changes recorded.</p>}
    </section>

    <section><h4 className="mb-2 font-bold text-white">Admin actions ({history.audit_events.length})</h4>
      {history.audit_events.length ? <ul className="space-y-1 text-gray-300">{history.audit_events.map((event) => <li key={event.id}>{dateText(event.created_at)} · {event.action} · {JSON.stringify(event.metadata)}</li>)}</ul> : <p className="text-gray-500">No account enforcement actions.</p>}
    </section>
  </div>;
}
