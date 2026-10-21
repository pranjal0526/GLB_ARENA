import React from 'react';
import Link from 'next/link';
import { Tournament } from '@/lib/supabase/types';
import { StatusBadge } from './status-badge';
import { Calendar, Users, Trophy, IndianRupee, ArrowRight, Gamepad2 } from 'lucide-react';
import { getTournamentBanner, isLegacyTournamentBanner } from '@/lib/utils/tournament-banner';

interface TournamentCardProps {
  tournament: Tournament;
}

export function TournamentCard({ tournament }: TournamentCardProps) {
  const isFree = tournament.entry_fee_paise === 0;
  const entryFeeInr = tournament.entry_fee_paise / 100;
  const prizePoolInr = tournament.prize_pool_paise / 100;

  // Format date in Asia/Kolkata
  const startDate = new Date(tournament.start_time).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const registered = tournament.registered_count || 0;
  const bannerUrl = !tournament.banner_url || isLegacyTournamentBanner(tournament.banner_url)
    ? getTournamentBanner(tournament.game, tournament.slug, tournament.title)
    : tournament.banner_url;
  const maxSlots = tournament.max_slots;
  const percentFilled = Math.min(100, Math.round((registered / maxSlots) * 100));
  const currentTime = Date.now();
  const displayStatus = tournament.status === 'open' && currentTime < new Date(tournament.registration_opens_at).getTime()
    ? 'registration_upcoming'
    : tournament.status === 'open' && currentTime > new Date(tournament.registration_closes_at).getTime()
      ? 'registration_closed'
      : tournament.status;

  return (
    <div className="group relative rounded-2xl bg-surface-100 border border-surface-border overflow-hidden transition-all duration-300 hover:border-brand-500/50 hover:shadow-glow flex flex-col">
      {/* Top Banner / Image */}
      <div className="relative h-44 w-full overflow-hidden bg-surface-200">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt={tournament.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-200">
            <Gamepad2 className="w-12 h-12 text-gray-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-100 via-surface-100/40 to-transparent" />
        
        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          <StatusBadge status={displayStatus} size="sm" />
        </div>

        {/* Game & Mode Pill */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-black/70 backdrop-blur-md text-cyanAccent-400 border border-cyanAccent-500/30">
            {tournament.game}
          </span>
          <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider bg-black/70 backdrop-blur-md text-gray-300 border border-white/10">
            {tournament.mode}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-display font-bold text-lg text-white group-hover:text-cyanAccent-400 transition-colors line-clamp-1">
            {tournament.title}
          </h3>
          <p className="mt-1 text-xs text-gray-400 line-clamp-2 leading-relaxed">
            {tournament.description}
          </p>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-surface-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Trophy className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-mono text-gray-400">Prize Pool</div>
                <div className="text-sm font-bold text-amber-300">
                  ₹{prizePoolInr.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <IndianRupee className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-mono text-gray-400">Entry Fee</div>
                <div className={`text-sm font-bold ${isFree ? 'text-emerald-400' : 'text-white'}`}>
                  {isFree ? 'FREE' : `₹${entryFeeInr}`}
                </div>
              </div>
            </div>
          </div>

          {/* Slots Progress */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1 font-mono">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-cyanAccent-400" />
                Slots: <strong className="text-white">{registered}</strong> / {maxSlots}
              </span>
              <span className="text-cyanAccent-400 font-bold">{percentFilled}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentFilled >= 100
                    ? 'bg-rose-500'
                    : percentFilled > 75
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-brand-500 to-cyanAccent-500'
                }`}
                style={{ width: `${percentFilled}%` }}
              />
            </div>
          </div>
        </div>

        {/* Footer info & CTA */}
        <div className="mt-5 pt-3 border-t border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-1 text-[11px] font-mono text-gray-400">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <span>{startDate} IST</span>
          </div>

          <Link
            href={`/tournaments/${tournament.slug}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-surface-50 hover:bg-brand-600 border border-surface-border hover:border-brand-500 transition-all group/btn"
          >
            <span>View Event</span>
            <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}
