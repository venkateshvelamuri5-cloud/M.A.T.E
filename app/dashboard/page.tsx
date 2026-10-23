'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calculator, ClipboardList, Compass, Package, Search, ShieldCheck, Ship, Star, Users, X } from 'lucide-react';
import { profileCompleteness, RunLog, useOfficer } from './_lib/officer';
import { isRunLog, Module, parseRequest, plainPreview } from './_lib/modules';
import { CATEGORY_LETTERS, CategoryLetter } from '../analyst/_lib/slots';
import { Button, Card, Chip, Meter, SlotCode, inputClass, timeAgo } from './_lib/ui';
import AskBox from './_components/AskBox';
import DocumentsCard from './_components/DocumentsCard';
import RunHistory, { moduleForLog, RunDialog } from './_components/RunHistory';

/** Category names are stored like "(A) ISM Admin Works"; the letter is shown on each module instead. */
const cleanCategory = (name: string) => name.replace(/^\([A-F]\)\s*/, '');

const CATEGORY_STYLE: Record<CategoryLetter, { icon: React.ElementType; tint: string }> = {
  A: { icon: ShieldCheck, tint: 'bg-indigo-50 text-[#575ECF]' },
  B: { icon: Calculator, tint: 'bg-emerald-50 text-emerald-700' },
  C: { icon: Users, tint: 'bg-sky-50 text-sky-700' },
  D: { icon: Package, tint: 'bg-amber-50 text-amber-700' },
  E: { icon: ClipboardList, tint: 'bg-rose-50 text-rose-700' },
  F: { icon: Compass, tint: 'bg-violet-50 text-violet-700' }
};

function usePins(userId: string) {
  const key = `mate-pins-${userId}`;
  const [pins, setPins] = useState<string[]>([]);
  useEffect(() => {
    try { setPins(JSON.parse(localStorage.getItem(key) || '[]')); } catch { /* storage unavailable */ }
  }, [key]);
  const toggle = (code: string) => setPins(p => {
    const next = p.includes(code) ? p.filter(c => c !== code) : [...p, code];
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });
  return { pins, toggle };
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OfficerHome() {
  const { userId, profile, modules, comingSoon, logs, categoryNames, files, runsUsed, runsMax, plan, openProfile, startUpgrade } = useOfficer();
  const [q, setQ] = useState('');
  const [openLog, setOpenLog] = useState<RunLog | null>(null);
  const { pins, toggle } = usePins(userId);
  const completeness = profileCompleteness(profile);
  const atLimit = runsMax > 0 && runsUsed >= runsMax;

  const recentAnswers = useMemo(() => logs
    .filter(l => isRunLog(l.subject, l.error_message) && l.status !== 'Failed' && l.email_response && moduleForLog(l, modules))
    .slice(0, 3), [logs, modules]);

  const runsThisList = useMemo(() => logs.filter(l => isRunLog(l.subject, l.error_message) && l.status !== 'Failed').length, [logs]);
  const pinned = modules.filter(m => pins.includes(m.code));

  const term = q.trim().toLowerCase();
  const matches = (m: Module) => !term || `${m.code} ${m.name} ${m.description} ${m.keywords.join(' ')} ${categoryNames[m.letter]}`.toLowerCase().includes(term);
  const found = modules.filter(matches);
  const general = modules.find(m => m.code === 'F4' && !m.paused);
  const firstName = (profile.full_name || '').split(' ').filter(w => !/^(capt|captain|c\/e|mr|ms|mrs)\.?$/i.test(w))[0];

  const vesselFacts = [
    profile.vessel_type,
    profile.grt ? `${profile.grt} GRT` : '',
    profile.has_pump_room === false ? `${profile.pump_system_type && profile.pump_system_type !== 'N/A' ? profile.pump_system_type : 'Deepwell'} pumps` : profile.has_pump_room ? 'Pump room' : '',
    profile.has_egcs ? `Scrubber (${profile.egcs_type})` : '',
    ...[['operates_us_waters', 'US'], ['operates_eu_waters', 'EU'], ['operates_aus_nz_waters', 'AUS/NZ'], ['operates_chinese_waters', 'China']]
      .filter(([k]) => (profile as any)[k]).map(([, l]) => `${l} waters`)
  ].filter(Boolean) as string[];

  const card = (m: Module, note?: string) => <ModuleCard key={m.code} module={m} note={note} pinned={pins.includes(m.code)} onPin={() => toggle(m.code)} />;

  return (
    <div className="space-y-8">
      {/* The bridge: who you are, which ship, and one box to ask anything. */}
      <section className="relative overflow-hidden rounded-3xl bg-[#0f2a3d] text-white px-5 sm:px-8 py-7 sm:py-9">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(900px 300px at 85% -10%, rgba(87,94,207,.55), transparent 60%), radial-gradient(600px 260px at -10% 120%, rgba(29,87,122,.9), transparent 60%)' }} />
        <svg aria-hidden className="pointer-events-none absolute -right-10 -bottom-16 w-72 h-72 text-white/[0.06]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.6">
          <circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="34" /><circle cx="50" cy="50" r="22" />
          <path d="M50 2v96M2 50h96M16 16l68 68M84 16L16 84" />
        </svg>
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] items-start">
          <div className="space-y-2 min-w-0">
            <p className="text-sm text-indigo-200">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
            <h1 className="font-display text-2xl sm:text-[34px] leading-tight font-semibold tracking-tight">
              {profile.vessel_name ? <>MV {profile.vessel_name}</> : 'What can M.A.T.E draft for you today?'}
            </h1>
            {vesselFacts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {vesselFacts.map(f => <span key={f} className="text-xs rounded-full bg-white/10 border border-white/15 px-2.5 py-0.5 text-indigo-50">{f}</span>)}
              </div>
            ) : (
              <button type="button" onClick={openProfile} className="text-sm text-indigo-100 underline underline-offset-4 hover:text-white">Add your vessel so answers fit your ship</button>
            )}
          </div>
          <div className="flex items-center gap-5">
            <RunsRing used={runsUsed} max={runsMax} />
            <div className="grid gap-1 text-sm">
              <span className="text-indigo-200 text-xs">This account</span>
              <span><b className="tabular-nums">{runsThisList}</b> <span className="text-indigo-200">answers</span></span>
              <span><b className="tabular-nums">{files.length}</b> <span className="text-indigo-200">documents</span></span>
              {plan !== 'premium' && <button type="button" onClick={startUpgrade} className="text-left text-xs font-semibold text-white underline underline-offset-4 decoration-white/40 hover:decoration-white">Upgrade</button>}
            </div>
          </div>
        </div>
        <div className="relative mt-6"><AskBox /></div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-8 min-w-0">
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
            <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-50 text-[#575ECF] flex items-center justify-center shrink-0"><Ship className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="text-sm"><b>Vessel profile {completeness.percent}% complete.</b> <span className="text-muted-foreground">Add {completeness.missing.slice(0, 3).join(', ')}{completeness.missing.length > 3 ? ' and more' : ''} for answers that fit your ship.</span></div>
                <Meter used={completeness.percent} max={100} className="max-w-xs" />
              </div>
              <Button size="sm" onClick={openProfile}>Finish profile</Button>
            </Card>
          )}

          {recentAnswers.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Pick up where you left off</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {recentAnswers.map(l => {
                  const m = moduleForLog(l, modules)!;
                  return (
                    <button key={l.id} type="button" onClick={() => setOpenLog(l)}
                      className="text-left rounded-2xl border border-border bg-card p-4 space-y-2 hover:border-[#575ECF]/50 hover:shadow-md transition group">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><SlotCode code={m.code} /> {m.name}</span>
                        <span>{timeAgo(l.created_at)}</span>
                      </div>
                      <div className="text-sm font-semibold line-clamp-2">{parseRequest(l.email_request).requirement || l.subject}</div>
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{plainPreview(l.email_response || '')}</p>
                      <span className="text-xs font-semibold text-[#575ECF] inline-flex items-center gap-1 opacity-80 group-hover:opacity-100">Open answer <ArrowRight className="w-3 h-3" /></span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {pinned.length > 0 && !term && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Star className="w-4 h-4 text-amber-500 fill-amber-400" /> Pinned</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{pinned.map(m => card(m))}</div>
            </section>
          )}

          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">All modules</h2>
              <div className="relative sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input id="module-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter modules" aria-label="Filter modules" className={`${inputClass} pl-9 pr-9`} />
                {q && <button type="button" onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" aria-label="Clear filter"><X className="w-4 h-4" /></button>}
              </div>
            </div>

            {term ? (
              found.length > 0
                ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{found.map(m => card(m))}</div>
                : <p className="text-sm text-muted-foreground">Nothing matches. Try another word{general ? <>, or ask <Link href={`/dashboard/modules/${general.code}`} className="text-[#575ECF] font-semibold hover:underline">{general.code} {general.name}</Link></> : ''}.</p>
            ) : (
              CATEGORY_LETTERS.map(letter => {
                const list = modules.filter(m => m.letter === letter);
                if (list.length === 0) return null;
                const { icon: Icon, tint } = CATEGORY_STYLE[letter];
                return (
                  <div key={letter} className="space-y-3">
                    <h3 className="flex items-center gap-2.5 text-sm font-semibold">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tint}`}><Icon className="w-4 h-4" /></span>
                      {cleanCategory(categoryNames[letter])}
                      <span className="text-xs font-normal text-muted-foreground">{list.length}</span>
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map(m => card(m))}</div>
                  </div>
                );
              })
            )}

            {!term && modules.length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground">No modules are available yet. The M.A.T.E team is setting them up.</Card>
            )}

            {!term && comingSoon.length > 0 && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm">
                <span className="font-semibold text-muted-foreground">Coming soon: </span>
                <span className="text-muted-foreground">{comingSoon.map(c => c.name).join(' · ')}</span>
              </div>
            )}
          </section>

          <RunHistory />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20">
          <DocumentsCard />
          <EmailCard />
        </aside>
      </div>

      <RunDialog log={openLog} onClose={() => setOpenLog(null)} />
    </div>
  );
}

function RunsRing({ used, max }: { used: number; max: number }) {
  const left = Math.max(0, max - used);
  const pct = max > 0 ? Math.min(1, used / max) : 1;
  const r = 30;
  const c = 2 * Math.PI * r;
  const color = pct >= 1 ? '#f87171' : pct >= 0.8 ? '#fbbf24' : '#a5b4fc';
  return (
    <div className="relative w-[76px] h-[76px] shrink-0" title={`${used} of ${max} runs used`}>
      <svg viewBox="0 0 76 76" className="w-full h-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="7" />
        <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * pct} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display text-xl font-semibold tabular-nums">{left}</span>
        <span className="text-[10px] text-indigo-200 mt-0.5">runs left</span>
      </div>
    </div>
  );
}

function ModuleCard({ module: m, note, pinned, onPin }: { module: Module; note?: string; pinned: boolean; onPin: () => void }) {
  const pin = (
    <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onPin(); }} aria-pressed={pinned} aria-label={pinned ? `Unpin ${m.name}` : `Pin ${m.name}`}
      className={`p-1 -m-1 rounded-md transition ${pinned ? 'text-amber-500' : 'text-zinc-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-amber-500'}`}>
      <Star className={`w-4 h-4 ${pinned ? 'fill-amber-400' : ''}`} />
    </button>
  );
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <SlotCode code={m.code} />
        {m.paused ? <Chip tone="amber">Paused for updates</Chip> : pin}
      </div>
      <div className="font-semibold text-[15px] leading-snug">{m.name}</div>
      {(note || m.description) && <p className="text-xs text-muted-foreground line-clamp-2">{note || m.description}</p>}
      {!m.paused && <span className="text-xs font-semibold text-[#575ECF] inline-flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition">Open <ArrowRight className="w-3 h-3" /></span>}
    </>
  );
  if (m.paused) {
    return <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-1.5 opacity-70" title="The M.A.T.E team is updating this module. It will be back shortly.">{body}</div>;
  }
  return (
    <Link href={`/dashboard/modules/${m.code}`} className="group rounded-2xl border border-border bg-card p-4 space-y-1.5 hover:border-[#575ECF]/50 hover:shadow-md hover:-translate-y-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#575ECF]/40">
      {body}
    </Link>
  );
}

function EmailCard() {
  const { openHelp } = useOfficer();
  return (
    <Card className="p-5 space-y-3 text-sm">
      <h2 className="font-semibold">Ask by email</h2>
      <p className="text-muted-foreground">Send a request to <b className="text-foreground">mate@logmark-ai.com</b> with the module code in the subject, e.g. <b className="text-foreground">A1</b>. The answer comes back by email.</p>
      <button type="button" onClick={() => openHelp('email')} className="font-semibold text-[#575ECF] hover:underline inline-flex items-center gap-1">How to write the email <ArrowRight className="w-3.5 h-3.5" /></button>
    </Card>
  );
}
