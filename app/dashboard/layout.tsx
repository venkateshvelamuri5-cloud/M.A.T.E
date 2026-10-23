'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CircleHelp, LogOut, UserRound, Sparkles } from 'lucide-react';
import { supabase } from '../../src/supabase-client';
import { OfficerProvider, useOfficer } from './_lib/officer';
import { Meter } from './_lib/ui';
import HelpPanel from './_components/HelpPanel';
import ProfileDialog from './_components/ProfileDialog';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <OfficerProvider>
      <Shell>{children}</Shell>
    </OfficerProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { profile, email, plan, runsUsed, runsMax, openHelp, openProfile, startUpgrade } = useOfficer();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const atLimit = runsMax > 0 && runsUsed >= runsMax;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const initials = (profile.full_name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0 mr-auto">
            <img src="/logo.jpeg" alt="" width={28} height={28} className="rounded" />
            <span className="font-display font-bold tracking-wide">M.A.T.E</span>
          </Link>

          <div className="flex items-center gap-2 text-xs text-muted-foreground" title={`${runsUsed} of ${runsMax} runs used`}>
            <span className="hidden md:inline">Runs used</span>
            <Meter used={runsUsed} max={runsMax} className="w-16 sm:w-24" />
            <span className={`font-mono tabular-nums ${atLimit ? 'text-red-600 font-semibold' : ''}`}>
              {runsUsed}<span className="hidden sm:inline"> of </span><span className="sm:hidden">/</span>{runsMax}
            </span>
          </div>

          {plan !== 'premium' && (
            <button type="button" onClick={startUpgrade}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${atLimit ? 'bg-[#575ECF] text-white hover:bg-[#464cb3]' : 'border border-[#575ECF]/40 text-[#575ECF] hover:bg-indigo-50'}`}>
              <Sparkles className="w-3.5 h-3.5" /> Upgrade
            </button>
          )}

          <button type="button" onClick={() => openHelp('start')} className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Help">
            <CircleHelp className="w-4 h-4" /><span className="hidden sm:inline">Help</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="Account"
              className="w-8 h-8 rounded-full bg-indigo-50 text-[#575ECF] text-xs font-bold flex items-center justify-center hover:ring-2 hover:ring-[#575ECF]/30">
              {initials || <UserRound className="w-4 h-4" />}
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-lg py-1.5 text-sm">
                <div className="px-4 py-2 border-b border-border mb-1">
                  <div className="font-semibold truncate">{profile.full_name || 'Officer'}</div>
                  <div className="text-xs text-muted-foreground truncate">{email}</div>
                </div>
                <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); openProfile(); }} className="w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2">
                  <UserRound className="w-4 h-4 text-muted-foreground" /> Profile &amp; vessel
                </button>
                {plan !== 'premium' && (
                  <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); startUpgrade(); }} className="sm:hidden w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-muted-foreground" /> Upgrade
                  </button>
                )}
                <button role="menuitem" type="button" onClick={signOut} className="w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2">
                  <LogOut className="w-4 h-4 text-muted-foreground" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-8 text-xs text-muted-foreground">
        M.A.T.E can make mistakes. Check every answer against your SMS and the regulations before you use it.
      </footer>

      <HelpPanel />
      <ProfileDialog />
    </div>
  );
}
