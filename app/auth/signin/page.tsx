'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Flame, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await signIn(identifier, password);
      if (res.success) {
        router.push(res.isAdmin ? '/admin' : '/dashboard');
      } else {
        setError(res.error || 'Failed to sign in');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-cyanAccent-500 p-0.5 inline-flex items-center justify-center shadow-glow mb-2">
            <div className="w-full h-full bg-surface-200 rounded-[10px] flex items-center justify-center">
              <Flame className="w-6 h-6 text-cyanAccent-400" />
            </div>
          </div>
          <h1 className="text-3xl font-display font-black text-white uppercase tracking-tight">
            Sign In to VY<span className="text-brand-400">ROX</span>
          </h1>
          <p className="text-xs text-gray-400 font-mono">
            Access your player profile, tournaments, and match credentials.
          </p>
        </div>



        {/* Traditional Credentials Form */}
        <div className="p-6 md:p-8 rounded-3xl bg-surface-100 border border-surface-border shadow-2xl space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  autoComplete="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  placeholder="player@email.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-200 border border-surface-border text-white text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 hover:to-cyanAccent-500 text-white font-bold text-xs uppercase tracking-wider shadow-glow transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{isLoading ? 'Signing In...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 text-center text-xs font-mono text-gray-400">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-cyanAccent-400 hover:underline font-bold">
              Register Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
