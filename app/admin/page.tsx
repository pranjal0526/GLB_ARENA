'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/portal-admin-vyrox');
  }, [router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center font-mono text-xs text-gray-500 animate-pulse">
      Redirecting to Secure Organizer Portal...
    </div>
  );
}
