'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getPlayerPhoneNumber, updatePlayerPhoneNumber, updateProfile } from '@/lib/services/profile-service';
import { getPlayerPrizeAwards } from '@/lib/services/prize-service';
import { PrizeAward } from '@/lib/supabase/types';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/services/store';
import { Avatar } from '@/components/avatar';
import { BadgeCollection } from '@/components/badge-collection';
import { buildLeaderboardShareUrl } from '@/lib/utils/share-links';
import { GameIdScreenshotUpload } from '@/components/game-id-verification';
import { 
  User,
  Zap,
  Trophy,
  Check,
  AlertCircle,
  Phone,
} from 'lucide-react';

const AVATAR_CHOICES = ['🎮', '🔥', '⚡', '🛡️', '👾', '🚀', '🐺', '🐉', '💀', '🦊', '🦅', '👑'];
const formatInr = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export default function ProfilePage() {
  const { currentUser, updateCurrentUserProfile, refreshCurrentUserProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bgmiIgn, setBgmiIgn] = useState('');
  const [bgmiUid, setBgmiUid] = useState('');
  const [freeFireIgn, setFreeFireIgn] = useState('');
  const [freeFireUid, setFreeFireUid] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [prizeAwards, setPrizeAwards] = useState<PrizeAward[]>([]);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    if (currentUser) {
      setDisplayName(currentUser.display_name);
      setBgmiIgn(currentUser.bgmi_ign || '');
      setBgmiUid(currentUser.bgmi_uid || '');
      setFreeFireIgn(currentUser.free_fire_ign || '');
      setFreeFireUid(currentUser.free_fire_uid || '');
      void getPlayerPhoneNumber(currentUser.id)
        .then((phone) => { if (mounted) setPhoneNumber(phone || ''); })
        .catch((error) => { if (mounted) setErrorMsg(error instanceof Error ? error.message : 'Could not load your phone number.'); });
    }
    return () => { mounted = false; };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const loadAwards = async () => {
      try { setPrizeAwards(await getPlayerPrizeAwards(currentUser.id)); }
      catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Could not load prize awards.'); }
    };
    void loadAwards();
    const refresh = () => { if (document.visibilityState === 'visible') { void loadAwards(); void refreshCurrentUserProfile(); } };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [currentUser?.id, refreshCurrentUserProfile]);

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center font-mono text-gray-400">
        Please sign in to view your profile.
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    if (Boolean(bgmiIgn.trim()) !== Boolean(bgmiUid.trim()) || Boolean(freeFireIgn.trim()) !== Boolean(freeFireUid.trim())) {
      setErrorMsg('For each game, enter both the in-game name and player ID, or leave both blank.');
      setIsSaving(false);
      return;
    }
    const phoneDigits = phoneNumber.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setErrorMsg('Enter a valid phone number with 7 to 15 digits.');
      setIsSaving(false);
      return;
    }

    try {
      const updated = await updateProfile(currentUser.id, {
        display_name: displayName.trim(),
        bgmi_ign: bgmiIgn.trim() || null,
        bgmi_uid: bgmiUid.trim() || null,
        free_fire_ign: freeFireIgn.trim() || null,
        free_fire_uid: freeFireUid.trim() || null,
      });

      if (updated) {
        await updatePlayerPhoneNumber(currentUser.id, phoneNumber.trim());
        updateCurrentUserProfile(updated);
        setSuccessMsg('Profile updated successfully!');
      } else {
        setErrorMsg('Failed to update profile.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error updating profile');
    } finally {
      setIsSaving(false);
    }
  };

  const peakRating = currentUser.highest_rating ?? currentUser.current_rating;

  const saveAvatar = async (avatarUrl: string) => {
    setAvatarSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await updateProfile(currentUser.id, { avatar_url: avatarUrl });
      if (!updated) throw new Error('Could not update your profile photo.');
      updateCurrentUserProfile(updated);
      setSuccessMsg('Profile avatar updated.');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not update your avatar.');
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (!file.type.startsWith('image/')) { setErrorMsg('Choose an image file.'); return; }
    if (file.size > 3 * 1024 * 1024) { setErrorMsg('Profile photos must be 3 MB or smaller.'); return; }
    if (!isSupabaseConfigured()) { setErrorMsg('Photo uploads need a connected Supabase project. Built-in avatars are available below.'); return; }
    setAvatarSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${currentUser.id}/${Date.now()}.${extension}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await saveAvatar(data.publicUrl);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not upload this photo. Apply migration 005 and try again.');
      setAvatarSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="border-b border-surface-border pb-6">
        <div className="flex items-center gap-4">
          <Avatar name={currentUser.display_name} avatarUrl={currentUser.avatar_url} className="w-16 h-16 text-2xl" />
          <div><h1 className="text-3xl font-display font-extrabold text-white">{currentUser.display_name}</h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage your BGMI and Free Fire player identities and review your tournament record.
        </p>
          </div>
        </div>
      </div>

      <section className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
        <div>
          <h2 className="font-display font-bold text-white text-lg">Profile picture &amp; avatar</h2>
          <p className="text-xs text-gray-400 mt-1">Upload a photo or pick an avatar. Your choice appears beside your name across the site.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {AVATAR_CHOICES.map((emoji) => (
            <button key={emoji} type="button" aria-label={`Choose ${emoji} avatar`} aria-pressed={currentUser.avatar_url === `emoji:${emoji}`}
              disabled={avatarSaving} onClick={() => void saveAvatar(`emoji:${emoji}`)}
              className={`w-12 h-12 rounded-xl border text-2xl transition-colors ${currentUser.avatar_url === `emoji:${emoji}` ? 'bg-brand-600/20 border-brand-400' : 'bg-surface-200 border-surface-border hover:border-cyanAccent-400'}`}>
              {emoji}
            </button>
          ))}
          <input ref={avatarFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={handleAvatarUpload} className="hidden" />
          <button type="button" disabled={avatarSaving} onClick={() => avatarFileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-sm font-bold text-white hover:border-cyanAccent-400 disabled:opacity-50">
            <User className="w-4 h-4" /> {avatarSaving ? 'Saving…' : 'Upload photo'}
          </button>
        </div>
        {successMsg && <p role="status" className="text-xs text-emerald-300">{successMsg}</p>}
        {errorMsg && <p role="alert" className="text-xs text-rose-300">{errorMsg}</p>}
      </section>

      <BadgeCollection displayName={currentUser.display_name} username={currentUser.username} rating={peakRating}
        currentRating={currentUser.current_rating}
        events={currentUser.total_tournaments} wins={currentUser.total_wins} kills={currentUser.total_kills}
        shareUrl={buildLeaderboardShareUrl({ player: currentUser.username })} />

      <section className="p-6 rounded-3xl bg-surface-100 border border-surface-border space-y-4">
        <div>
          <h2 className="font-display font-bold text-white text-lg flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-300" /> Tournament prize awards</h2>
          <p className="text-xs text-gray-400 mt-1">Configured payouts are recorded when the final match is scored. The organizer updates the status after sending the UPI or bank transfer.</p>
        </div>
        {prizeAwards.length ? <div className="space-y-2">
          {prizeAwards.map((award) => <div key={award.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-200/60 border border-surface-border px-4 py-3">
            <div><div className="font-semibold text-white">{award.tournament?.title || 'Tournament award'} · #{award.place}</div><div className="text-xs text-gray-400">{award.registration?.team_name || 'Your entry'}</div></div>
            <div className="text-right"><div className="font-mono font-bold text-amber-300">{formatInr(award.amount_paise)}</div><div className={`text-[10px] uppercase font-bold ${award.status === 'paid' ? 'text-emerald-300' : 'text-amber-300'}`}>{award.status === 'paid' ? 'Paid' : 'Awaiting transfer'}</div></div>
          </div>)}
        </div> : <p className="text-sm text-gray-400">Prize awards from completed tournaments will appear here.</p>}
      </section>

      {/* Ratings and Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-surface-100 border border-surface-border">
          <div className="text-xs font-mono uppercase text-gray-400">VYROX Rating</div>
          <div className="text-2xl font-black font-mono text-brand-400 flex items-center gap-1.5 mt-1">
            <Zap className="w-5 h-5" />
            {currentUser.current_rating} PTS
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface-100 border border-surface-border">
          <div className="text-xs font-mono uppercase text-gray-400">Total Tournaments</div>
          <div className="text-2xl font-black font-mono text-white mt-1">
            {currentUser.total_tournaments}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface-100 border border-surface-border">
          <div className="text-xs font-mono uppercase text-gray-400">Match Wins</div>
          <div className="text-2xl font-black font-mono text-amber-400 mt-1">
            {currentUser.total_wins}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface-100 border border-surface-border">
          <div className="text-xs font-mono uppercase text-gray-400">Total Kills</div>
          <div className="text-2xl font-black font-mono text-cyanAccent-400 mt-1">
            {currentUser.total_kills}
          </div>
        </div>
      </div>

      {/* Profile Edit Form */}
      <div className="p-6 md:p-8 rounded-3xl bg-surface-100 border border-surface-border space-y-6">
        <h3 className="font-display font-bold text-white text-lg">
          Contact &amp; In-Game Details
        </h3>

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Username (Immutable)
              </label>
              <input
                type="text"
                disabled
                value={currentUser.username}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-gray-400 font-mono text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="max-w-xl pt-2">
            <label htmlFor="profile-phone" className="mb-1 flex items-center gap-2 text-xs font-mono uppercase text-gray-400">
              <Phone className="h-3.5 w-3.5" /> Phone Number
            </label>
            <input
              id="profile-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="e.g. +91 98765 43210"
              pattern="\\+?[0-9][0-9\\s().-]{6,18}"
              maxLength={20}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">Used by organizers to contact you about tournament entries. Only you and authorized admins can view it.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-mono uppercase text-cyanAccent-400 mb-1">
                BGMI In-Game Name (IGN)
              </label>
              <input
                type="text"
                value={bgmiIgn}
                onChange={(e) => setBgmiIgn(e.target.value)}
                placeholder="e.g. SOUL_Mortal"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-cyanAccent-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-cyanAccent-400 mb-1">
                BGMI Character ID / UID
              </label>
              <input
                type="text"
                value={bgmiUid}
                onChange={(e) => setBgmiUid(e.target.value)}
                placeholder="e.g. 5172635412"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm focus:border-cyanAccent-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-orange-300 mb-1">Free Fire In-Game Name (IGN)</label>
              <input
                type="text"
                value={freeFireIgn}
                onChange={(e) => setFreeFireIgn(e.target.value)}
                placeholder="e.g. FreeFire_Player"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-orange-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-orange-300 mb-1">Free Fire Player ID</label>
              <input
                type="text"
                value={freeFireUid}
                onChange={(e) => setFreeFireUid(e.target.value)}
                placeholder="Player ID"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm focus:border-orange-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GameIdScreenshotUpload game="BGMI" ign={bgmiIgn} uid={bgmiUid} />
            <GameIdScreenshotUpload game="Free Fire" ign={freeFireIgn} uid={freeFireUid} />
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 hover:to-cyanAccent-500 text-white font-bold text-xs uppercase tracking-wider shadow-glow transition-all disabled:opacity-50"
            >
              {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
