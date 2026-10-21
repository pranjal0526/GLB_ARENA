'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { GitHubAuthButton } from '@/components/github-auth-button';
import { Flame, Lock, AlertCircle, ArrowRight } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [game, setGame] = useState<'BGMI' | 'Free Fire'>('BGMI');
  const [bgmiIgn, setBgmiIgn] = useState('');
  const [bgmiUid, setBgmiUid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailConfirmationPending, setEmailConfirmationPending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain alphanumeric characters and underscores.');
      return;
    }

    if (username.trim().length < 3 || username.trim().length > 24) {
      setError('Username must be between 3 and 24 characters.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (bgmiIgn.trim().length < 2 || displayName.trim().length < 2) {
      setError('Enter a display name and an in-game name with at least 2 characters.');
      return;
    }

    if (!/^\d{5,}$/.test(bgmiUid.trim())) {
      setError(`${game} Player ID must contain at least 5 digits.`);
      return;
    }

    setIsLoading(true);
    try {
      const res = await signUp({
        email,
        password,
        username: username.trim(),
        displayName: displayName.trim(),
        game,
        ign: bgmiIgn.trim(),
        uid: bgmiUid.trim(),
      });

      if (res.success) {
        if (res.emailConfirmationRequired) {
          setEmailConfirmationPending(true);
          setNotice('Account created. Confirm your email using the link we sent; it will sign you in and return you to your dashboard.');
        } else {
          router.push('/dashboard');
        }
      } else {
        setError(res.error || 'Failed to create account.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-cyanAccent-500 p-0.5 inline-flex items-center justify-center shadow-glow mb-2">
            <div className="w-full h-full bg-surface-200 rounded-[10px] flex items-center justify-center">
              <Flame className="w-6 h-6 text-cyanAccent-400" />
            </div>
          </div>
          <h1 className="text-3xl font-display font-black text-white uppercase tracking-tight">
            Create Player Profile
          </h1>
          <p className="text-xs text-gray-400 font-mono">
            Join tournaments, record match results, and track your national ranking.
          </p>
          <p className="text-[11px] text-gray-500">
            Faded placeholder text is an example hint. Replace it with your own account and game details.
          </p>
        </div>

        <div className="p-6 md:p-8 rounded-3xl bg-surface-100 border border-surface-border shadow-2xl space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-300">
              {notice}
            </div>
          )}

          <GitHubAuthButton />
          <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono uppercase">
            <span className="h-px bg-surface-border flex-1" />or use email<span className="h-px bg-surface-border flex-1" />
          </div>

          {emailConfirmationPending ? (
            <div className="text-center text-xs font-mono text-gray-400">
              Confirm your email using the link we sent. It will sign you in and return you here. Or{' '}
              <Link href="/auth/signin" className="text-cyanAccent-400 hover:underline font-bold">sign in</Link>.
            </div>
          ) : <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                  Unique Username <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="mortal_viper"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                  Display Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  placeholder="Naman Mathur"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="player@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-gray-500">
                  Email signup needs a confirmation link. GitHub signup avoids confirmation-email sending limits.
                </p>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                  Password <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Primary game identity */}
            <div className="p-4 rounded-2xl bg-surface-200/50 border border-surface-border space-y-3">
              <div className="text-xs font-mono uppercase text-cyanAccent-400 font-bold">
                Tournament Game Identity
              </div>
              <label className="block text-xs font-mono uppercase text-gray-400">
                Main game
                <select
                  value={game}
                  onChange={(event) => setGame(event.target.value as 'BGMI' | 'Free Fire')}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-cyanAccent-500 focus:outline-none"
                >
                  <option value="BGMI">BGMI</option>
                  <option value="Free Fire">Free Fire</option>
                </select>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                    {game} In-Game Name (IGN) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={bgmiIgn}
                    onChange={(e) => setBgmiIgn(e.target.value)}
                    required
                    placeholder={game === 'BGMI' ? 'SOUL_Mortal' : 'FreeFire_Player'}
                    className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-cyanAccent-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                    {game} Player ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={bgmiUid}
                    onChange={(e) => setBgmiUid(e.target.value)}
                    required
                    placeholder="Player ID"
                    className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-cyanAccent-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 hover:to-cyanAccent-500 text-white font-bold text-xs uppercase tracking-wider shadow-glow transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{isLoading ? 'Creating Account...' : 'Complete Registration'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>}

          <div className="pt-2 text-center text-xs font-mono text-gray-400">
            Already registered?{' '}
            <Link href="/auth/signin" className="text-cyanAccent-400 hover:underline font-bold">
              Sign In Here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
