import React from 'react';
import Link from 'next/link';
import { getTournaments } from '@/lib/services/tournament-service';
import { getLeaderboard } from '@/lib/services/profile-service';
import { getStore } from '@/lib/services/store';
import { TournamentCard } from '@/components/tournament-card';
import { 
  Trophy, 
  Flame, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  ChevronRight, 
  Users, 
  CheckCircle2, 
  IndianRupee, 
  Swords, 
  HelpCircle,
  QrCode
} from 'lucide-react';

export default async function HomePage() {
  const store = getStore();
  const allTournaments = await getTournaments();
  const topPlayers = (await getLeaderboard()).slice(0, 5);

  // Platform statistics derived from actual records
  const totalTournamentsCount = store.tournaments.length;
  const activeRegistrationsCount = store.registrations.length;
  const totalPrizeDistributed = store.tournaments.reduce((acc, t) => acc + (t.prize_pool_paise / 100), 0);
  const activePlayersCount = store.profiles.length;

  const featuredTournaments = allTournaments.filter(t => t.status === 'open' || t.status === 'live').slice(0, 3);
  const upcomingTournaments = allTournaments.filter(t => t.status === 'open').slice(0, 3);

  return (
    <div className="space-y-24 pb-16">
      {/* 1. HERO SECTION */}
      <section className="relative pt-16 pb-20 md:pt-28 md:pb-32 overflow-hidden bg-cyber-grid">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-brand-600/15 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[300px] h-[250px] bg-cyanAccent-500/15 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-100 border border-brand-500/30 text-xs font-mono text-cyanAccent-400 mb-8 shadow-glow-sm">
            <span className="w-2 h-2 rounded-full bg-cyanAccent-400 animate-ping" />
            <span>INDIA&apos;S PREMIER BGMI TOURNAMENT ARENA</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-display font-black tracking-tight text-white uppercase max-w-5xl mx-auto leading-none">
            Forge Your Legacy in the{' '}
            <span className="bg-gradient-to-r from-brand-400 via-purple-300 to-cyanAccent-400 bg-clip-text text-transparent">
              BGMI Arena
            </span>
          </h1>

          {/* Subheading */}
          <p className="mt-6 text-base sm:text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Register your squad, submit verified UPI payments, compete in custom lobbies, and build a persistent competitive rating recognized across India.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/tournaments"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold text-base shadow-glow hover:shadow-glow-cyan transition-all flex items-center justify-center gap-2 group"
            >
              <span>Explore Tournaments</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/leaderboard"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-surface-100 hover:bg-surface-50 text-white font-semibold text-base border border-surface-border hover:border-brand-500/50 transition-all flex items-center justify-center gap-2"
            >
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>View Leaderboard</span>
            </Link>
          </div>

          {/* Trust Badges */}
          <div className="mt-14 pt-8 border-t border-surface-border/60 max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono text-gray-400">
            <div className="flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Manual POV Audits</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <QrCode className="w-4 h-4 text-cyanAccent-400" />
              <span>Instant UPI UTR Verify</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-4 h-4 text-brand-400" />
              <span>Automated Brackets</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              <span>Skill Elo System</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PLATFORM STATISTICS (Actual database-backed records) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-surface-100/90 border border-surface-border p-8 md:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-y md:divide-y-0 md:divide-x divide-surface-border">
            <div className="flex flex-col items-center text-center p-2">
              <div className="text-3xl sm:text-4xl font-display font-black text-cyanAccent-400">
                ₹{totalPrizeDistributed.toLocaleString('en-IN')}
              </div>
              <div className="text-xs font-mono uppercase text-gray-400 mt-1">Total Prize Pool Tracked</div>
            </div>

            <div className="flex flex-col items-center text-center p-2 pt-6 md:pt-2">
              <div className="text-3xl sm:text-4xl font-display font-black text-white">
                {totalTournamentsCount}
              </div>
              <div className="text-xs font-mono uppercase text-gray-400 mt-1">Tournaments Hosted</div>
            </div>

            <div className="flex flex-col items-center text-center p-2 pt-6 md:pt-2">
              <div className="text-3xl sm:text-4xl font-display font-black text-brand-400">
                {activeRegistrationsCount}
              </div>
              <div className="text-xs font-mono uppercase text-gray-400 mt-1">Squad Registrations</div>
            </div>

            <div className="flex flex-col items-center text-center p-2 pt-6 md:pt-2">
              <div className="text-3xl sm:text-4xl font-display font-black text-emerald-400">
                {activePlayersCount}
              </div>
              <div className="text-xs font-mono uppercase text-gray-400 mt-1">Verified Competitive Profiles</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. FEATURED TOURNAMENTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="text-xs font-mono uppercase text-cyanAccent-400 tracking-wider">
              HIGH STAKES COMPETITION
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white mt-1">
              Featured Tournaments
            </h2>
          </div>
          <Link
            href="/tournaments"
            className="text-sm font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1 group"
          >
            <span>View All Tournaments</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {featuredTournaments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredTournaments.map(t => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-100 border border-surface-border p-12 text-center text-gray-400">
            <Swords className="w-12 h-12 mx-auto text-gray-600 mb-3" />
            <p className="font-semibold text-white">No active tournaments right now</p>
            <p className="text-xs mt-1">Check back soon or create one from the Admin Panel.</p>
          </div>
        )}
      </section>

      {/* 4. HOW IT WORKS (The Main User Flow) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-xs font-mono uppercase text-brand-400 tracking-wider">
            STEP-BY-STEP WORKFLOW
          </div>
          <h2 className="text-3xl font-display font-bold text-white mt-1">
            How to Compete on VYROX
          </h2>
          <p className="text-sm text-gray-400 mt-2">
            From squad registration to leaderboard supremacy in 4 seamless steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          <div className="p-6 rounded-2xl bg-surface-100 border border-surface-border relative">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center font-mono font-bold text-lg mb-4">
              01
            </div>
            <h3 className="font-display font-bold text-white text-base mb-2">Create Profile</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Sign up, link your BGMI In-Game Name and Character UID. Start with an initial rating of 1000 PTS.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface-100 border border-surface-border relative">
            <div className="w-10 h-10 rounded-xl bg-cyanAccent-500/10 border border-cyanAccent-500/20 text-cyanAccent-400 flex items-center justify-center font-mono font-bold text-lg mb-4">
              02
            </div>
            <h3 className="font-display font-bold text-white text-base mb-2">Register & Pay</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Choose your format (Solo, 1v1, or Squad). For paid events, scan the manual UPI QR and submit your 12-digit UTR.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface-100 border border-surface-border relative">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-mono font-bold text-lg mb-4">
              03
            </div>
            <h3 className="font-display font-bold text-white text-base mb-2">Admin Verification</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Organizers verify your UTR reference against bank logs. Confirmed squads unlock custom lobby room credentials.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface-100 border border-surface-border relative">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-bold text-lg mb-4">
              04
            </div>
            <h3 className="font-display font-bold text-white text-base mb-2">Battle & Rank Up</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Match results and kills automatically update your persistent national rating and tournament standings.
            </p>
          </div>
        </div>
      </section>

      {/* 5. TOP PLAYERS PREVIEW */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="text-xs font-mono uppercase text-amber-400 tracking-wider">
              NATIONAL RANKINGS
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white mt-1">
              Top Ranked Players
            </h2>
          </div>
          <Link
            href="/leaderboard"
            className="text-sm font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1 group"
          >
            <span>Full Leaderboard</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="rounded-2xl bg-surface-100 border border-surface-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-200/60 border-b border-surface-border text-xs uppercase font-mono text-gray-400">
                <tr>
                  <th className="py-3.5 px-4 text-center w-16">Rank</th>
                  <th className="py-3.5 px-4">Player</th>
                  <th className="py-3.5 px-4">BGMI IGN & UID</th>
                  <th className="py-3.5 px-4 text-center">Wins</th>
                  <th className="py-3.5 px-4 text-center">Kills</th>
                  <th className="py-3.5 px-4 text-right">VYROX Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {topPlayers.map((player, idx) => (
                  <tr key={player.id} className="hover:bg-surface-50/50 transition-colors">
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold font-mono ${
                        idx === 0 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                          : idx === 1 
                          ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40' 
                          : idx === 2 
                          ? 'bg-amber-700/20 text-amber-500 border border-amber-700/40' 
                          : 'text-gray-400'
                      }`}>
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-900 border border-brand-500/30 flex items-center justify-center font-bold text-xs text-brand-300">
                          {player.display_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{player.display_name}</div>
                          <div className="text-xs text-gray-400 font-mono">@{player.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <div className="text-cyanAccent-400 font-semibold">{player.bgmi_ign || 'N/A'}</div>
                      <div className="text-gray-500 text-[11px]">UID: {player.bgmi_uid || 'N/A'}</div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-white">
                      {player.total_wins}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-gray-300">
                      {player.total_kills}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-brand-400 text-base">
                      {player.current_rating} PTS
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6. FAQ SECTION */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="text-xs font-mono uppercase text-cyanAccent-400 tracking-wider">
            FREQUENTLY ASKED QUESTIONS
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-white mt-1">
            Tournament FAQ
          </h2>
        </div>

        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-surface-100 border border-surface-border">
            <h4 className="font-semibold text-white flex items-center gap-2 text-sm sm:text-base">
              <HelpCircle className="w-4 h-4 text-cyanAccent-400" />
              How does the manual UPI QR payment verification work?
            </h4>
            <p className="text-xs sm:text-sm text-gray-400 mt-2 pl-6 leading-relaxed">
              When registering for a paid tournament, you scan the platform UPI QR code and pay the exact entry fee from any UPI app (GPay, PhonePe, Paytm). After payment, copy the 12-digit UTR/UPI reference from the payment receipt and submit it on VYROX. Tournament administrators verify the reference against their bank credit logs before approving your squad slot.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface-100 border border-surface-border">
            <h4 className="font-semibold text-white flex items-center gap-2 text-sm sm:text-base">
              <HelpCircle className="w-4 h-4 text-cyanAccent-400" />
              When are custom room ID and passwords released?
            </h4>
            <p className="text-xs sm:text-sm text-gray-400 mt-2 pl-6 leading-relaxed">
              Room credentials are securely released to confirmed participants only, typically 15 minutes prior to match schedule. You can access the credentials directly in your Player Hub or on the tournament fixture match card.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface-100 border border-surface-border">
            <h4 className="font-semibold text-white flex items-center gap-2 text-sm sm:text-base">
              <HelpCircle className="w-4 h-4 text-cyanAccent-400" />
              How is the VYROX competitive rating calculated?
            </h4>
            <p className="text-xs sm:text-sm text-gray-400 mt-2 pl-6 leading-relaxed">
              All players start with 1000 points. For 1v1 arenas, we use the Elo rating formula (K-factor 32). For Battle Royale lobbies, points are calculated based on placement finishes (1st place receives +35 rating) plus verified individual kills (+3 per kill). Ratings persist across all events.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
