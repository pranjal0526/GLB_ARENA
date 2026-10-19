'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Flame, Lock, Mail, User, Gamepad2, AlertCircle, ArrowRight } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bgmiIgn, setBgmiIgn] = useState('');
  const [bgmiUid, setBgmiUid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain alphanumeric characters and underscores.');
      return;
    }

    if (!/^\d+$/.test(bgmiUid)) {
      setError('BGMI Character UID must contain digits only.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await signUp({
        email,
        username: username.trim(),
        displayName: displayName.trim(),
        bgmiIgn: bgmiIgn.trim(),
        bgmiUid: bgmiUid.trim(),
      });

      if (res.success) {
        router.push('/dashboard');
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
        </div>

        <div className="p-6 md:p-8 rounded-3xl bg-surface-100 border border-surface-border shadow-2xl space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                  Unique Username <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="player@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                  Password <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* In-Game BGMI Details */}
            <div className="p-4 rounded-2xl bg-surface-200/50 border border-surface-border space-y-3">
              <div className="text-xs font-mono uppercase text-cyanAccent-400 font-bold">
                BGMI Tournament Identity
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                    BGMI In-Game Name (IGN) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={bgmiIgn}
                    onChange={(e) => setBgmiIgn(e.target.value)}
                    required
                    placeholder="SOUL_Mortal"
                    className="w-full px-3 py-2 rounded-xl bg-surface-100 border border-surface-border text-white text-sm focus:border-cyanAccent-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                    BGMI Character UID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={bgmiUid}
                    onChange={(e) => setBgmiUid(e.target.value)}
                    required
                    placeholder="5172635412"
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
          </form>

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
