'use client';

import { useState } from 'react';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}

export function Avatar({ name, avatarUrl, className = '' }: AvatarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const emoji = avatarUrl?.startsWith('emoji:') ? avatarUrl.slice('emoji:'.length) : null;

  return (
    <div className={`overflow-hidden rounded-full bg-brand-900 border border-brand-500/40 flex items-center justify-center text-brand-200 ${className}`} aria-label={`${name}'s avatar`}>
      {emoji ? <span aria-hidden="true">{emoji}</span> : avatarUrl && failedAvatarUrl !== avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" onError={() => setFailedAvatarUrl(avatarUrl)} />
      ) : <span className="font-bold uppercase">{name.trim().charAt(0) || '?'}</span>}
    </div>
  );
}
