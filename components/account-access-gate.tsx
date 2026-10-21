'use client';

import React from 'react';
import { Mail, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { SUPPORT_EMAIL } from '@/lib/config/support';

export function AccountAccessGate({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading, signOut } = useAuth();

  if (isLoading) {
    return <main className="min-h-screen flex items-center justify-center bg-background px-4 text-sm font-mono text-gray-400">Checking account access…</main>;
  }

  if (currentUser && currentUser.account_status !== 'active') {
    const banned = currentUser.account_status === 'banned';
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <section className="w-full max-w-lg rounded-3xl border border-rose-500/30 bg-surface-100 p-8 text-center shadow-2xl">
          <ShieldAlert className="mx-auto h-12 w-12 text-rose-400" />
          <h1 className="mt-5 text-2xl font-display font-extrabold text-white">
            {banned ? 'Account banned' : 'Account temporarily restricted'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-300">
            Your account is currently {banned ? 'banned' : 'suspended'}, so access to VYROX Arena is paused.
            Contact the administrator if you believe this is a mistake or want to request a review.
          </p>
          {currentUser.ban_reason && (
            <p className="mt-4 rounded-xl border border-surface-border bg-surface-200 px-4 py-3 text-left text-sm text-gray-300">
              Reason: {currentUser.ban_reason}
            </p>
          )}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-500">
            <Mail className="h-4 w-4" /> Contact support: {SUPPORT_EMAIL}
          </a>
          <button type="button" onClick={() => void signOut()} className="mx-auto mt-5 block text-sm text-gray-400 underline underline-offset-4 hover:text-white">
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
