'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { updateProfile } from '@/lib/services/profile-service';
import { 
  User, 
  Gamepad2, 
  ShieldCheck, 
  Calendar, 
  Zap, 
  Trophy, 
  Flame, 
  Check, 
  AlertCircle 
} from 'lucide-react';

export default function ProfilePage() {
  const { currentUser, updateCurrentUserProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [bgmiIgn, setBgmiIgn] = useState('');
  const [bgmiUid, setBgmiUid] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.display_name);
      setBgmiIgn(currentUser.bgmi_ign || '');
      setBgmiUid(currentUser.bgmi_uid || '');
    }
  }, [currentUser]);

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

    try {
      const updated = await updateProfile(currentUser.id, {
        display_name: displayName.trim(),
        bgmi_ign: bgmiIgn.trim(),
        bgmi_uid: bgmiUid.trim(),
      });

      if (updated) {
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

  const winRate = currentUser.total_tournaments > 0 
    ? Math.round((currentUser.total_wins / currentUser.total_tournaments) * 100) 
    : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="border-b border-surface-border pb-6">
        <h1 className="text-3xl font-display font-extrabold text-white">
          Competitive Player Profile
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage your BGMI in-game identity and review your persistent platform ratings.
        </p>
      </div>

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
          <div className="text-xs font-mono uppercase text-gray-400">Victories (WWCD)</div>
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
          In-Game Credentials
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-mono uppercase text-cyanAccent-400 mb-1">
                BGMI In-Game Name (IGN) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={bgmiIgn}
                onChange={(e) => setBgmiIgn(e.target.value)}
                required
                placeholder="e.g. SOUL_Mortal"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-cyanAccent-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-cyanAccent-400 mb-1">
                BGMI Character ID / UID <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={bgmiUid}
                onChange={(e) => setBgmiUid(e.target.value)}
                required
                placeholder="e.g. 5172635412"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white font-mono text-sm focus:border-cyanAccent-500 focus:outline-none"
              />
            </div>
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
