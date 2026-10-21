'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export function GitHubAuthButton() {
  const { signInWithGitHub } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('auth_error');
    if (!reason) return;

    const messages: Record<string, string> = {
      oauth: 'Sign-in could not be completed. Check the Supabase provider settings and confirm this site’s /auth/callback URL is allowed.',
      profile: 'Your account was authenticated, but its player profile is missing. Check the profile trigger and run the required database migrations.',
      account: 'This player account is not active. Contact the tournament organizer.',
    };
    setError(messages[reason] || 'GitHub sign-in failed.');
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const handleClick = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await signInWithGitHub();
      if (!result.success) {
        setError(result.error || 'Could not connect to GitHub.');
        setIsLoading(false);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not connect to GitHub.');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-200 text-gray-950 font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.16c-3.2.7-3.88-1.36-3.88-1.36-.53-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17a10.9 10.9 0 0 1 5.73 0c2.19-1.48 3.15-1.17 3.15-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.41-2.69 5.38-5.25 5.67.41.36.77 1.06.77 2.14v3.17c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
        </svg>
        <span>{isLoading ? 'Connecting to GitHub...' : 'Continue with GitHub'}</span>
      </button>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
