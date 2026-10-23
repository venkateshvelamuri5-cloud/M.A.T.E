'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, Ship, X } from 'lucide-react';
import { profileCompleteness, useOfficer } from './_lib/officer';
import { Module } from './_lib/modules';
import { CATEGORY_LETTERS } from '../analyst/_lib/slots';
import { Button, Card, Chip, Meter, SlotCode, inputClass, timeAgo } from './_lib/ui';
import DocumentsCard from './_components/DocumentsCard';
import RunHistory, { moduleForLog } from './_components/RunHistory';

/** Category names are stored like "(A) ISM Admin Works"; the letter is shown on each module instead. */
const cleanCategory = (name: string) => name.replace(/^\([A-F]\)\s*/, '');

export default function OfficerHome() {
  const { profile, modules, comingSoon, logs, categoryNames, runsUsed, runsMax, plan, openProfile, openHelp, startUpgrade } = useOfficer();
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const completeness = profileCompleteness(profile);
  const atLimit = runsMax > 0 && runsUsed >= runsMax;

  // "/" jumps to search, as on most sites with a search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const recent = useMemo(() => {
    const seen = new Map<string, { module: Module; at: string; request: string }>();
    for (const l of logs) {
      const m = moduleForLog(l, modules);
      if (!m || seen.has(m.code)) continue;
      seen.set(m.code, { module: m, at: l.created_at, request: l.subject });
      if (seen.size === 3) break;
    }
    return Array.from(seen.values());
  }, [logs, modules]);

  const term = q.trim().toLowerCase();
  const matches = (m: Module) => !term || `${m.code} ${m.name} ${m.description} ${m.keywords.join(' ')} ${categoryNames[m.letter]}`.toLowerCase().includes(term);
  const found = modules.filter(matches);
  const general = modules.find(m => m.code === 'F4' && !m.paused);
  const firstName = (profile.full_name || '').split(' ').filter(w => !/^(capt|captain|c\/e|mr|ms|mrs)\.?$/i.test(w))[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px] items-start">
      <div className="space-y-8 min-w-0">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome to M.A.T.E'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile.vessel_name ? <>Answers are tailored for <b className="text-foreground font-medium">MV {profile.vessel_name}</b>{profile.vessel_type ? ` (${profile.vessel_type})` : ''}.</> : 'Pick a module, describe what you need, and get a draft written for your ship.'}
          </p>
        </div>

        {atLimit && (
          <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 border-red-200 bg-red-50/60">
            <div className="flex-1">
              <div className="font-semibold text-sm">You&apos;ve used all {runsMax} runs</div>
              <p className="text-sm text-muted-foreground">{plan === 'premium' ? 'Contact the M.A.T.E team to raise your limit.' : 'Upgrade to keep using M.A.T.E. Your history and documents stay available.'}</p>
            </div>
            {plan !== 'premium' && <Button variant="primary" onClick={startUpgrade}>Upgrade</Button>}
          </Card>
        )}

        {completeness.percent < 100 && (
          <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-[#575ECF] flex items-center justify-center shrink-0"><Ship className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-sm"><b>Your vessel profile is {completeness.percent}% complete.</b> <span className="text-muted-foreground">Add {completeness.missing.slice(0, 3).join(', ')}{completeness.missing.length > 3 ? ' and more' : ''} so answers fit your ship.</span></div>
              <Meter used={completeness.percent} max={100} className="max-w-xs" />
            </div>
            <Button onClick={openProfile}>Finish profile</Button>
          </Card>
        )}

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            id="module-search"
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search modules, e.g. bunkering, payroll, drill"
            className={`${inputClass} pl-10 pr-10 py-2.5 text-[15px]`}
            aria-label="Search modules"
          />
          {q && <button type="button" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" aria-label="Clear search"><X className="w-4 h-4" /></button>}
        </div>

        {!term && recent.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Recent</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {recent.map(r => <ModuleCard key={r.module.code} module={r.module} note={`Used ${timeAgo(r.at)}`} />)}
            </div>
          </section>
        )}

        {term ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{found.length} module{found.length === 1 ? '' : 's'} match &ldquo;{q.trim()}&rdquo;</h2>
            {found.length > 0
              ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{found.map(m => <ModuleCard key={m.code} module={m} />)}</div>
              : <p className="text-sm text-muted-foreground">Nothing matches. Try another word{general ? <>, or ask <Link href={`/dashboard/modules/${general.code}`} className="text-[#575ECF] font-semibold hover:underline">{general.code} {general.name}</Link></> : ''}.</p>}
          </section>
        ) : (
          CATEGORY_LETTERS.map(letter => {
            const list = modules.filter(m => m.letter === letter);
            if (list.length === 0) return null;
            return (
              <section key={letter} className="space-y-3">
                <h2 className="font-display text-lg font-semibold">{cleanCategory(categoryNames[letter])}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map(m => <ModuleCard key={m.code} module={m} />)}</div>
              </section>
            );
          })
        )}

        {!term && modules.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">No modules are available yet. The M.A.T.E team is setting them up.</Card>
        )}

        {!term && comingSoon.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Coming soon</h2>
            <p className="text-sm text-muted-foreground">{comingSoon.map(c => `${c.code} ${c.name}`).join(' · ')}</p>
          </section>
        )}

        <RunHistory />
      </div>

      <aside className="space-y-6 lg:sticky lg:top-20">
        <DocumentsCard />
        <Card className="p-5 space-y-3 text-sm">
          <h2 className="font-semibold">Ask by email</h2>
          <p className="text-muted-foreground">Send a request to <b className="text-foreground">mate@logmark-ai.com</b> with the module code in the subject, e.g. <b className="text-foreground">A1</b>. The answer comes back by email.</p>
          <button type="button" onClick={() => openHelp('email')} className="font-semibold text-[#575ECF] hover:underline inline-flex items-center gap-1">How to write the email <ArrowRight className="w-3.5 h-3.5" /></button>
        </Card>
      </aside>
    </div>
  );
}

function ModuleCard({ module: m, note }: { module: Module; note?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <SlotCode code={m.code} />
        {m.paused && <Chip tone="amber">Paused for updates</Chip>}
      </div>
      <div className="font-semibold text-[15px] leading-snug">{m.name}</div>
      {(note || m.description) && <p className="text-xs text-muted-foreground line-clamp-2">{note || m.description}</p>}
    </>
  );
  if (m.paused) {
    return <div className="rounded-xl border border-border bg-card/60 p-4 space-y-1.5 opacity-70" title="The M.A.T.E team is updating this module. It will be back shortly.">{body}</div>;
  }
  return (
    <Link href={`/dashboard/modules/${m.code}`} className="group rounded-xl border border-border bg-card p-4 space-y-1.5 hover:border-[#575ECF]/50 hover:shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#575ECF]/40">
      {body}
    </Link>
  );
}
