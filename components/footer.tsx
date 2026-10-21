import React from 'react';
import Link from 'next/link';
import { Flame, ShieldCheck, CreditCard, Award } from 'lucide-react';
import { SUPPORT_EMAIL } from '@/lib/config/support';

export function Footer() {
  return (
    <footer className="border-t border-surface-border bg-surface-300 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Brand info */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-cyanAccent-500 p-0.5 flex items-center justify-center">
                <div className="w-full h-full bg-background rounded-[6px] flex items-center justify-center">
                  <Flame className="w-4 h-4 text-cyanAccent-400" />
                </div>
              </div>
              <span className="font-display font-black text-xl tracking-wider text-white">
                VY<span className="text-brand-400">ROX</span>
              </span>
            </div>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Competitive gaming tournaments for BGMI and Free Fire players, squads, and organizers across India.
            </p>
            <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-400 pt-2">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4" /> Anti-Cheat Audits
              </span>
              <span className="flex items-center gap-1.5 text-cyanAccent-400">
                <CreditCard className="w-4 h-4" /> UPI QR Instant Verify
              </span>
              <span className="flex items-center gap-1.5 text-brand-400">
                <Award className="w-4 h-4" /> Persistent Rating
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wider uppercase font-mono mb-4">
              Platform
            </h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <Link href="/tournaments" className="hover:text-brand-400 transition-colors">
                  Browse Tournaments
                </Link>
              </li>
              <li>
                <Link href="/leaderboard" className="hover:text-brand-400 transition-colors">
                  National Leaderboard
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-brand-400 transition-colors">
                  Player Dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white tracking-wider uppercase font-mono mb-4">
              Contact Us
            </h4>
            <p className="text-sm text-gray-400">Questions about your account or a tournament?</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-block mt-2 text-sm text-cyanAccent-400 hover:text-cyanAccent-300 break-all">
              {SUPPORT_EMAIL}
            </a>
          </div>

          {/* Legal and Disclaimer */}
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wider uppercase font-mono mb-4">
              Fair Play & Legal
            </h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <span className="text-xs text-gray-500">Currency: Indian Rupees (INR ₹)</span>
              </li>
              <li>
                <span className="text-xs text-gray-500">Timezone: Asia/Kolkata (IST)</span>
              </li>
              <li>
                <span className="text-xs text-gray-400">
                  Fair Play Policy & POV Recording
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-surface-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500 text-center md:text-left">
            © {new Date().getFullYear()} VYROX Arena. All rights reserved. BGMI and Free Fire are trademarks of their respective owners. VYROX is an independent tournament platform.
          </p>
          <div className="flex gap-4 text-xs text-gray-400">
            <span>Server Time (IST)</span>
            <span className="text-emerald-400 font-mono">LIVE 24/7</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
