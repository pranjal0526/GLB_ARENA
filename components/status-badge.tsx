import React from 'react';
import { TournamentStatus, RegistrationStatus, PaymentStatus } from '@/lib/supabase/types';

interface StatusBadgeProps {
  status: TournamentStatus | RegistrationStatus | PaymentStatus | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const s = status.toLowerCase();
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs font-semibold';

  let colorClasses = 'bg-surface-200 text-gray-300 border-surface-border';

  switch (s) {
    case 'open':
      colorClasses = 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 shadow-sm';
      break;
    case 'registration_upcoming':
      colorClasses = 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40';
      break;
    case 'live':
      colorClasses = 'bg-rose-950/70 text-rose-400 border-rose-500/50 animate-pulse';
      break;
    case 'completed':
    case 'verified':
    case 'confirmed':
      colorClasses = 'bg-cyan-950/60 text-cyan-400 border-cyan-500/40';
      break;
    case 'pending_payment':
    case 'pending':
      colorClasses = 'bg-amber-950/60 text-amber-400 border-amber-500/40';
      break;
    case 'payment_submitted':
    case 'submitted':
      colorClasses = 'bg-violet-950/60 text-violet-300 border-violet-500/40';
      break;
    case 'rejected':
    case 'cancelled':
    case 'disqualified':
    case 'banned':
      colorClasses = 'bg-red-950/60 text-red-400 border-red-500/40';
      break;
    case 'draft':
    case 'registration_closed':
      colorClasses = 'bg-gray-800/80 text-gray-400 border-gray-700';
      break;
  }

  const formatText = (txt: string) => {
    return txt.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${padding} ${colorClasses} tracking-wider font-mono uppercase`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
      {formatText(status)}
    </span>
  );
}
