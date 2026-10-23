'use client';
import React, { useState } from 'react';
import { Copy, Search } from 'lucide-react';
import { HelpTab, useOfficer } from '../_lib/officer';
import { MATE_EMAIL } from '../_lib/modules';
import { Dialog, SlotCode, inputClass } from '../_lib/ui';

const TABS: { id: HelpTab; label: string }[] = [
  { id: 'start', label: 'Getting started' },
  { id: 'email', label: 'Ask by email' },
  { id: 'how', label: 'How answers are made' },
  { id: 'manual', label: 'User manual' }
];

/** One place for every guide: the old three guide buttons and the manual window, together. */
export default function HelpPanel() {
  const { helpTab, closeHelp, openHelp } = useOfficer();
  return (
    <Dialog open={!!helpTab} onClose={closeHelp} title="Help" wide>
      <div className="flex gap-1 overflow-x-auto border-b border-border -mt-1 mb-5" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" type="button" aria-selected={helpTab === t.id} onClick={() => openHelp(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${helpTab === t.id ? 'border-[#575ECF] text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {helpTab === 'start' && <GettingStarted />}
      {helpTab === 'email' && <ByEmail />}
      {helpTab === 'how' && <HowItWorks />}
      {helpTab === 'manual' && <Manual />}
    </Dialog>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="space-y-4">
      {items.map(([title, body], i) => (
        <li key={title} className="grid grid-cols-[28px_1fr] gap-3">
          <span className="w-7 h-7 rounded-full bg-indigo-50 text-[#575ECF] text-sm font-bold flex items-center justify-center">{i + 1}</span>
          <div>
            <div className="font-semibold text-sm">{title}</div>
            <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function GettingStarted() {
  const { openProfile, closeHelp } = useOfficer();
  return (
    <div className="space-y-6">
      <Steps items={[
        ['Fill in your vessel profile', 'Vessel type, pumping system, scrubber and trading areas shape every answer. A tanker with deepwell pumps gets different controls from one with a pump room.'],
        ['Pick a module', 'Search on the home page or open one from its category. Modules marked "Paused" are being updated and come back shortly.'],
        ['Describe what you need', 'Be specific. "Midship crane inoperative; terminal requires it before berthing for loading" gets a far better answer than "crane not working". Add any points the answer must cover.'],
        ['Add documents if they help', 'Tick files from your workspace or drop a new one, such as an office email or a manual extract. Company documents from the M.A.T.E team are always included.'],
        ['Use the answer', 'Copy it, download it as Word, or have it emailed. Rate it with thumbs up or down so the team can improve the module.']
      ]} />
      <button type="button" onClick={() => { closeHelp(); openProfile(); }} className="text-sm font-semibold text-[#575ECF] hover:underline">Open my vessel profile</button>
    </div>
  );
}

function ByEmail() {
  const { modules, profile, toast } = useOfficer();
  const live = modules.filter(m => !m.paused);
  const copy = async () => {
    try { await navigator.clipboard.writeText(MATE_EMAIL); toast('Address copied.'); } catch { toast(MATE_EMAIL, 'info'); }
  };
  return (
    <div className="space-y-5 text-sm">
      <p className="text-muted-foreground leading-relaxed">Useful on board when the browser is slow. Plain-text emails are smallest and work best.</p>
      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2 font-mono text-[13px]">
        <div className="flex items-center gap-2"><span className="text-muted-foreground w-20 shrink-0">To</span><span className="font-semibold">{MATE_EMAIL}</span>
          <button type="button" onClick={copy} className="ml-1 p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Copy address"><Copy className="w-3.5 h-3.5" /></button></div>
        <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">Subject</span><span>The module code, e.g. <b>A1</b>, or one of its keywords</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">Body</span><span>One line saying what you need. Then a blank line and any points it must include.</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">Attach</span><span>PDFs that help, such as the office email asking for it</span></div>
      </div>
      <p className="text-muted-foreground">
        Send from your interaction email{profile.vessel_email ? <> (<b className="text-foreground">{profile.vessel_email}</b>)</> : ''} or your sign-in email. Each email uses one run.
      </p>
      <div>
        <h3 className="font-semibold mb-2">Module codes</h3>
        <div className="rounded-xl border border-border divide-y divide-border">
          {live.map(m => (
            <div key={m.code} className="px-4 py-2.5 grid grid-cols-[40px_1fr] gap-x-3">
              <SlotCode code={m.code} />
              <div className="min-w-0">
                <div className="font-medium">{m.name}</div>
                {m.keywords.length > 0 && <div className="text-xs text-muted-foreground">Subject keywords: {m.keywords.slice(0, 6).join(', ')}</div>}
                {m.emailExample && <div className="text-xs text-muted-foreground italic truncate" title={m.emailExample}>e.g. {m.emailExample}</div>}
              </div>
            </div>
          ))}
          {live.length === 0 && <div className="px-4 py-3 text-muted-foreground">No modules are live right now.</div>}
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="space-y-6">
      <Steps items={[
        ['Your request is read', 'For emailed requests, phone numbers, personal email addresses and similar details are taken out of the email before it goes to the AI.'],
        ['Documents are searched', 'M.A.T.E looks through the files you picked, the module\'s own documents and the company documents, and uses only the sections that match your request.'],
        ['Your vessel profile is added', 'Vessel type, machinery, cargo and trading areas tell the AI which rules and controls apply to your ship.'],
        ['The module writes the answer', 'Each module has its own instructions written by the M.A.T.E team. The answer lists which documents it used.']
      ]} />
      <p className="text-sm text-muted-foreground border-l-2 border-amber-400 pl-3">
        M.A.T.E can make mistakes. Check every answer against your SMS, flag and class requirements before you act on it. Long manuals use more of the AI&apos;s reading budget, so pick only the documents that matter.
      </p>
    </div>
  );
}

function Manual() {
  const { manual } = useOfficer();
  const [q, setQ] = useState('');
  if (!manual.trim()) return <p className="text-sm text-muted-foreground">The user manual hasn&apos;t been published yet. The other tabs cover the basics.</p>;
  const paras = manual.split(/\n\s*\n/);
  const term = q.trim().toLowerCase();
  const shown = term ? paras.filter(p => p.toLowerCase().includes(term)) : paras;
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input id="manual-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the manual" className={`${inputClass} pl-9`} />
      </div>
      {term && <p className="text-xs text-muted-foreground">{shown.length} section{shown.length === 1 ? '' : 's'} mention &ldquo;{q.trim()}&rdquo;</p>}
      <div className="space-y-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
        {shown.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </div>
  );
}
