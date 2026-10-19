'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { 
  Trophy, 
  Shield, 
  User, 
  Menu, 
  X, 
  Flame, 
  LogOut, 
  Zap, 
  CheckCircle2, 
  SlidersHorizontal 
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { currentUser, isAdmin, signOut, loginAs } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-surface-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-brand-600 to-cyanAccent-500 p-0.5 flex items-center justify-center shadow-glow-sm group-hover:shadow-glow transition-all">
                <div className="w-full h-full bg-background rounded-[7px] flex items-center justify-center">
                  <Flame className="w-5 h-5 text-cyanAccent-400 group-hover:scale-110 transition-transform" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-display font-black text-xl tracking-wider text-white">
                  VY<span className="text-brand-400">ROX</span>
                </span>
                <span className="text-[9px] tracking-widest text-cyanAccent-400 uppercase font-mono -mt-1">
                  Esports India
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-1">
              <Link
                href="/tournaments"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/tournaments')
                    ? 'text-cyanAccent-400 bg-surface-100 border border-surface-border'
                    : 'text-gray-300 hover:text-white hover:bg-surface-50'
                }`}
              >
                Tournaments
              </Link>
              <Link
                href="/leaderboard"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isActive('/leaderboard')
                    ? 'text-brand-400 bg-surface-100 border border-surface-border'
                    : 'text-gray-300 hover:text-white hover:bg-surface-50'
                }`}
              >
                <Trophy className="w-4 h-4" />
                Leaderboard
              </Link>
              {currentUser && (
                <Link
                  href="/dashboard"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/dashboard')
                      ? 'text-brand-400 bg-surface-100 border border-surface-border'
                      : 'text-gray-300 hover:text-white hover:bg-surface-50'
                  }`}
                >
                  My Hub
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    isActive('/admin')
                      ? 'text-rose-400 bg-rose-950/40 border border-rose-500/30'
                      : 'text-rose-300 hover:text-rose-200 hover:bg-rose-950/20'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Admin Panel
                </Link>
              )}
            </div>
          </div>

          {/* User Controls & Demo Switcher */}
          <div className="hidden md:flex items-center gap-3">
            {/* Quick Demo Role Switcher for Pair-programming & Evaluation */}
            <div className="relative">
              <button
                onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-surface-100 border border-surface-border hover:border-brand-500/50 text-gray-300 hover:text-white transition-all"
                title="Switch test persona"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyanAccent-400" />
                <span>Switch Persona: <strong className="text-white">{isAdmin ? 'Admin' : 'Player'}</strong></span>
              </button>

              {roleSwitcherOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-surface-100 border border-surface-border rounded-xl shadow-2xl p-2 z-50">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-surface-border">
                    Select Test Account:
                  </div>
                  <button
                    onClick={() => {
                      loginAs('p-player-01');
                      setRoleSwitcherOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-surface-50 flex items-center justify-between text-gray-200 mt-1"
                  >
                    <div>
                      <div className="font-semibold text-white">Naman (Mortal)</div>
                      <div className="text-[10px] text-emerald-400">Player • Rating 1420</div>
                    </div>
                    {currentUser?.id === 'p-player-01' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                  <button
                    onClick={() => {
                      loginAs('p-admin-01');
                      setRoleSwitcherOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-surface-50 flex items-center justify-between text-gray-200 mt-1"
                  >
                    <div>
                      <div className="font-semibold text-white">VYROX Admin</div>
                      <div className="text-[10px] text-rose-400">Admin • Full Privileges</div>
                    </div>
                    {currentUser?.id === 'p-admin-01' && <CheckCircle2 className="w-4 h-4 text-rose-400" />}
                  </button>
                </div>
              )}
            </div>

            {currentUser ? (
              <div className="flex items-center gap-3 pl-2 border-l border-surface-border">
                <Link
                  href="/profile"
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-surface-100 border border-surface-border hover:border-brand-500/50 transition-all group"
                >
                  <div className="w-7 h-7 rounded-full bg-brand-900 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-brand-300">
                    {currentUser.display_name.charAt(0)}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-semibold text-white group-hover:text-brand-300 transition-colors">
                      {currentUser.display_name}
                    </span>
                    <span className="text-[10px] font-mono text-cyanAccent-400 flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" />
                      {currentUser.current_rating} PTS
                    </span>
                  </div>
                </Link>

                <button
                  onClick={signOut}
                  className="p-2 text-gray-400 hover:text-rose-400 hover:bg-surface-100 rounded-lg transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth/signin"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-200 hover:text-white hover:bg-surface-100 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-glow-sm hover:shadow-glow transition-all"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-surface-border bg-surface-200 px-4 pt-2 pb-4 space-y-2">
          <Link
            href="/tournaments"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-200 hover:bg-surface-50"
          >
            Tournaments
          </Link>
          <Link
            href="/leaderboard"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-200 hover:bg-surface-50"
          >
            Leaderboard
          </Link>
          {currentUser && (
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-200 hover:bg-surface-50"
            >
              My Hub
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-rose-400 bg-rose-950/20 hover:bg-rose-950/40"
            >
              Admin Panel
            </Link>
          )}

          <div className="pt-4 border-t border-surface-border">
            <div className="text-xs text-gray-400 uppercase font-mono mb-2">Switch Test Account</div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  loginAs('p-player-01');
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 py-1.5 px-2 text-xs rounded border text-center ${
                  currentUser?.id === 'p-player-01'
                    ? 'border-brand-500 bg-brand-950/50 text-white'
                    : 'border-surface-border text-gray-400'
                }`}
              >
                Player (Mortal)
              </button>
              <button
                onClick={() => {
                  loginAs('p-admin-01');
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 py-1.5 px-2 text-xs rounded border text-center ${
                  currentUser?.id === 'p-admin-01'
                    ? 'border-rose-500 bg-rose-950/50 text-white'
                    : 'border-surface-border text-gray-400'
                }`}
              >
                Admin (VYROX)
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
