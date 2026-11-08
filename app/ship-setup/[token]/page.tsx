'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Copy, Printer, RefreshCw } from 'lucide-react';
import PublicShell from '../../../components/crew/PublicShell';
import { Button, Card, Chip, Field, inputClass } from '../../analyst/_lib/ui';

interface RankRow { code: string; label: string; onboardEmail: string | null; testPassed: boolean; officer: string | null }
interface Setup {
  vesselName: string | null;
  imo: string | null;
  masterEmail: string;
  mateInbox: string;
  setupComplete: boolean;
  ranks: RankRow[];
}
type Client = 'classic' | 'new';

const code = (c: string) => `MATE-${c}`;

// What each part of a rule is called in each Outlook.
const WORDS: Record<Client, Record<string, string>> = {
  classic: {
    'From': 'from people or public group',
    'Subject includes': 'with specific words in the subject',
    'Forward to': 'forward it to people or public group',
    'Except from': 'except if from people or public group'
  },
  new: { 'From': 'From', 'Subject includes': 'Subject includes', 'Forward to': 'Forward to', 'Except from': 'From' }
};

function CopyValue({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs break-all">{value}</code>
      <button
        type="button"
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted print:hidden"
        aria-label={`Copy ${value}`}
        onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
      >
        {done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}

const STEPS: Record<Client, string[]> = {
  classic: [
    'File, then Manage Rules & Alerts, then New Rule.',
    'Choose "Apply rule on messages I receive" and click Next.',
    'Tick the conditions shown below. Click each underlined word to enter the value, then Next.',
    'Tick "forward it to people or public group", enter the address, then Next.',
    'Where an exception is listed, tick "except if from people or public group" and enter it. Next.',
    'Type the rule name, keep "Turn on this rule" ticked, and click Finish.'
  ],
  new: [
    'Open Settings (the gear), then Mail, then Rules, then "+ Add new rule".',
    'Type the rule name.',
    'Add the conditions shown below ("From" and "Subject includes").',
    'Add the action "Forward to" and enter the address.',
    'Where an exception is listed, choose "Add an exception", then "From", and enter it.',
    'Leave "Stop processing more rules" unticked and click Save.'
  ]
};

export default function ShipSetupPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState<Client>('classic');
  const [vesselName, setVesselName] = useState('');
  const [imo, setImo] = useState('');
  const [mailboxes, setMailboxes] = useState<Record<string, string>>({});

  const apply = (s: Setup) => {
    setSetup(s);
    setVesselName(s.vesselName || '');
    setImo(s.imo || '');
    setMailboxes(Object.fromEntries(s.ranks.map(r => [r.code, r.onboardEmail || ''])));
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crew/setup?token=${encodeURIComponent(token)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      apply(j);
    } catch (e) {
      setError((e as Error).message || 'This setup link is not valid.');
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const post = async (action: 'save' | 'complete') => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch('/api/crew/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, vesselName, imo, mailboxes })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      apply(j);
      setNotice(action === 'save'
        ? 'Saved. Your rules are below.'
        : `Setup finished. ${j.welcomeSent ? `${j.welcomeSent} welcome email(s) sent to the ranks through your rules.` : 'Welcome emails were already sent.'}`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <PublicShell><Card className="p-6 text-sm">{error}</Card></PublicShell>;
  if (!setup) return <PublicShell><p className="text-sm text-muted-foreground">Loading…</p></PublicShell>;

  const ship = setup.vesselName ? `MV ${setup.vesselName}` : 'your ship';
  const saved = setup.ranks.filter(r => r.onboardEmail);
  const unsaved = setup.ranks.some(r => (mailboxes[r.code] || '').trim().toLowerCase() !== (r.onboardEmail || ''));

  return (
    <PublicShell>
      <div>
        <h1 className="text-2xl font-bold font-display">Ship email setup for {ship}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Once this is done, officers can use M.A.T.E from their onboard mailboxes through {setup.masterEmail}.
          It's done once per ship and stays the same at crew changes.
        </p>
      </div>

      <Card className="p-5 space-y-4 print:hidden">
        <div>
          <h2 className="font-bold">1. The ship and its onboard mailboxes</h2>
          <p className="text-xs text-muted-foreground mt-1">Enter each rank's intranet address once. Leave a rank blank if it has no mailbox.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Vessel name" htmlFor="ss-name"><input id="ss-name" className={inputClass} value={vesselName} onChange={e => setVesselName(e.target.value)} placeholder="Pioneer Mariner" /></Field>
          <Field label="IMO number (optional)" htmlFor="ss-imo"><input id="ss-imo" inputMode="numeric" className={inputClass} value={imo} onChange={e => setImo(e.target.value)} placeholder="9876543" /></Field>
        </div>
        <div className="space-y-2">
          {setup.ranks.map(r => (
            <div key={r.code} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 sm:gap-3 sm:items-center">
              <label htmlFor={`mb-${r.code}`} className="text-sm font-semibold">{r.label} <span className="text-muted-foreground font-normal">({code(r.code)})</span></label>
              <input id={`mb-${r.code}`} type="email" className={inputClass} value={mailboxes[r.code] || ''}
                onChange={e => setMailboxes(m => ({ ...m, [r.code]: e.target.value }))} placeholder="onboard address" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => post('save')} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          {notice && <span className="text-sm text-muted-foreground">{notice}</span>}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">2. Add these rules in Outlook</h2>
            <p className="text-xs text-muted-foreground mt-1">{1 + saved.length} rules: one for questions going out, one per rank for answers coming back.</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-semibold">
              {(['classic', 'new'] as Client[]).map(c => (
                <button key={c} type="button" onClick={() => setClient(c)}
                  className={`px-2.5 py-1 rounded-md ${client === c ? 'bg-[#575ECF] text-white' : 'text-muted-foreground'}`}>
                  {c === 'classic' ? 'Classic Outlook' : 'New Outlook'}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print</Button>
          </div>
        </div>
        {unsaved && <p className="text-xs text-amber-700">Save the mailboxes above to update these rules.</p>}

        <ol className="list-decimal pl-5 space-y-1 text-sm">
          {STEPS[client].map(s => <li key={s}>{s}</li>)}
        </ol>

        <div className="space-y-3">
          <Rule n={1} name="M.A.T.E questions out"
            conditions={[['Subject includes', 'MATE-']]}
            action={['Forward to', setup.mateInbox]}
            exception={['Except from', setup.mateInbox]}
            client={client}
            note="The exception stops answers, which keep the code in their subject, from going back to M.A.T.E." />
          {saved.map((r, i) => (
            <Rule key={r.code} n={i + 2} name={`M.A.T.E answers to ${r.label}`}
              conditions={[['From', setup.mateInbox], ['Subject includes', code(r.code)]]}
              action={['Forward to', r.onboardEmail as string]} client={client} />
          ))}
          {!saved.length && <p className="text-sm text-muted-foreground">Save at least one onboard mailbox to see the answer rules.</p>}
        </div>
        <p className="text-xs text-muted-foreground">
          In classic Outlook these rules run while Outlook is open on this PC. In the new Outlook with an Exchange or Microsoft 365 mailbox they run on the server.
        </p>
      </Card>

      <Card className="p-5 space-y-4 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">3. Test each rank</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Each officer emails {setup.masterEmail} from their onboard mailbox with the subject "MATE-CE TEST" (their own code).
              M.A.T.E replies, and the rank gets a tick here.
            </p>
          </div>
          <Button size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
        </div>
        <ul className="divide-y divide-border text-sm">
          {setup.ranks.map(r => (
            <li key={r.code} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {r.testPassed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                <span className="font-semibold">{r.label}</span>
                <span className="text-muted-foreground">{code(r.code)}</span>
              </span>
              <span className="flex items-center gap-2">
                {r.officer ? <Chip tone="indigo">{r.officer}</Chip> : <Chip>No officer linked</Chip>}
                {!r.onboardEmail && <Chip tone="amber">No mailbox</Chip>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5 space-y-3 print:hidden">
        <h2 className="font-bold">4. Finish</h2>
        <p className="text-sm text-muted-foreground">
          M.A.T.E sends one welcome email per rank through your rules, telling each officer how to sign up and which code to use.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => post('complete')} disabled={busy || !saved.length}>
            {setup.setupComplete ? 'Send welcome to new mailboxes' : 'Finish setup and send welcome emails'}
          </Button>
          {setup.setupComplete && <Chip tone="green">Setup finished</Chip>}
        </div>
      </Card>
    </PublicShell>
  );
}

function Rule({ n, name, conditions, action, exception, note, client }: {
  n: number; name: string; conditions: [string, string][]; action: [string, string]; exception?: [string, string]; note?: string; client: Client;
}) {
  const w = (k: string) => WORDS[client][k] || k;
  return (
    <div className="rounded-xl border border-border p-4 text-sm space-y-2 break-inside-avoid">
      <div className="font-semibold">Rule {n}: <CopyValue value={name} /></div>
      <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
        <span className="text-muted-foreground">When</span>
        <span className="space-y-1">{conditions.map(([k, v]) => <span key={k} className="block">{w(k)}: <CopyValue value={v} /></span>)}</span>
        <span className="text-muted-foreground">Do</span>
        <span>{w(action[0])}: <CopyValue value={action[1]} /></span>
        {exception && <>
          <span className="text-muted-foreground">Except</span>
          <span>{w(exception[0])}: <CopyValue value={exception[1]} /></span>
        </>}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
