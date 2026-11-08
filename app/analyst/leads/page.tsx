'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../../../src/supabase-client';
import { useAnalyst } from '../_lib/context';
import { Card, Chip, EmptyState, PageHeader, timeAgo } from '../_lib/ui';

type LeadStatus = 'new' | 'contacted' | 'signed_up' | 'not_interested';
interface Lead {
  id: string;
  vesselName: string | null;
  imo: string | null;
  masterEmail: string;
  createdAt: string;
  setupComplete: boolean;
  masterOnMate: boolean;
  masterName: string | null;
  companies: string[];
  crew: { name: string; email: string; company: string | null; rank: string; status: 'pending' | 'active' }[];
  leadStatus: LeadStatus;
  leadNote: string;
  leadUpdatedAt: string | null;
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', signed_up: 'Signed up', not_interested: 'Not interested'
};

async function api(method: 'GET' | 'PATCH', body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/analyst/ship-leads', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong.');
  return json;
}

const shipName = (l: Lead) => (l.vesselName ? `MV ${l.vesselName}` : l.masterEmail);

function inviteMailto(l: Lead) {
  const officers = l.crew.filter(c => c.status === 'active').length;
  const subject = `M.A.T.E for ${shipName(l)}`;
  const body = [
    'Dear Captain,',
    '',
    `${officers ? `${officers} of your officers already use` : 'Your officers have started using'} M.A.T.E on ${shipName(l)} through your mailbox.`,
    'M.A.T.E can also draft the Master\'s own paperwork: risk assessments, audit closures, drill records and more, written for your ship.',
    '',
    `Create your account here (it's free to start): ${window.location.origin}/signup?rank=Master&ship_email=${encodeURIComponent(l.masterEmail)}&ref=analyst-invite`,
    '',
    'Best regards,',
    'M.A.T.E Team'
  ].join('\n');
  return `mailto:${l.masterEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ShipLeadsPage() {
  const { toast } = useAnalyst();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState<'leads' | 'all'>('leads');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const { leads } = await api('GET');
      setLeads(leads);
      setNotes(Object.fromEntries((leads as Lead[]).map(l => [l.id, l.leadNote])));
    } catch (e) {
      toast(`Couldn't load ship leads: ${(e as Error).message}`, 'error');
      setLeads([]);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (l: Lead, patch: { leadStatus?: LeadStatus; leadNote?: string }) => {
    try {
      await api('PATCH', { id: l.id, ...patch });
      setLeads(cur => cur && cur.map(x => (x.id === l.id ? { ...x, ...patch, leadUpdatedAt: new Date().toISOString() } : x)));
      toast(`Saved ${shipName(l)}.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const stats = useMemo(() => {
    const all = leads || [];
    const open = all.filter(l => !l.masterOnMate);
    return {
      ships: all.length,
      open: open.length,
      officers: open.reduce((n, l) => n + l.crew.filter(c => c.status === 'active').length, 0),
      companies: new Set(all.flatMap(l => l.companies)).size
    };
  }, [leads]);

  const shown = (leads || []).filter(l => filter === 'all' || (!l.masterOnMate && l.leadStatus !== 'not_interested'));

  return (
    <>
      <PageHeader
        title="Ship leads"
        subtitle="Ships whose officers use M.A.T.E through the Master's mailbox. A Master who isn't on M.A.T.E yet is a lead."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Ships linked', stats.ships],
          ['Masters not on M.A.T.E', stats.open],
          ['Officers on those ships', stats.officers],
          ['Companies seen', stats.companies]
        ].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold mt-1">{leads === null ? '…' : value}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Ships</h2>
          <div className="flex gap-1 text-xs">
            {(['leads', 'all'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-full font-semibold ${filter === f ? 'bg-indigo-100 text-[#575ECF]' : 'text-muted-foreground hover:bg-muted'}`}>
                {f === 'leads' ? 'Open leads' : 'All ships'}
              </button>
            ))}
          </div>
        </div>
        {leads === null ? <EmptyState>Loading ships…</EmptyState> : shown.length === 0 ? (
          <EmptyState>{filter === 'leads' ? 'No open leads. Every linked ship\'s Master is on M.A.T.E, or marked not interested.' : 'No officer has linked a ship yet.'}</EmptyState>
        ) : (
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Ship</th>
                <th className="px-5 py-2.5 font-semibold">Master</th>
                <th className="px-5 py-2.5 font-semibold">Officers using M.A.T.E</th>
                <th className="px-5 py-2.5 font-semibold">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(l => (
                <tr key={l.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-5 py-3">
                    <div className="font-semibold">{shipName(l)}</div>
                    <div className="text-xs text-muted-foreground">{l.imo ? `IMO ${l.imo} · ` : ''}first linked {timeAgo(l.createdAt)}</div>
                    {l.companies.length > 0 && <div className="text-xs text-muted-foreground mt-0.5">{l.companies.join(', ')}</div>}
                    <div className="mt-1">{l.setupComplete ? <Chip tone="green">Email set up</Chip> : <Chip tone="amber">Setup not finished</Chip>}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="break-all">{l.masterEmail}</div>
                    <div className="mt-1">
                      {l.masterOnMate ? <Chip tone="green">On M.A.T.E{l.masterName ? `: ${l.masterName}` : ''}</Chip> : <Chip tone="indigo">Not on M.A.T.E</Chip>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {l.crew.length === 0 ? <span className="text-xs text-muted-foreground">None right now</span> : (
                      <ul className="space-y-0.5">
                        {l.crew.map(c => (
                          <li key={c.email + c.rank} className="text-xs">
                            <span className="font-semibold text-foreground">{c.rank}</span> {c.name}
                            {c.status === 'pending' && <span className="text-amber-700"> (pending)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-5 py-3 space-y-2 w-[300px]">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Lead status for ${shipName(l)}`}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        value={l.leadStatus}
                        onChange={e => save(l, { leadStatus: e.target.value as LeadStatus })}
                      >
                        {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                      {!l.masterOnMate && (
                        <a href={inviteMailto(l)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#575ECF] hover:underline">
                          <Mail className="w-3.5 h-3.5" /> Invite Master
                        </a>
                      )}
                    </div>
                    <textarea
                      aria-label={`Note for ${shipName(l)}`}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      placeholder="Note, e.g. spoke to the DPA, demo booked"
                      value={notes[l.id] ?? ''}
                      onChange={e => setNotes(n => ({ ...n, [l.id]: e.target.value }))}
                      onBlur={() => { if ((notes[l.id] ?? '') !== l.leadNote) save(l, { leadNote: notes[l.id] ?? '' }); }}
                    />
                    {l.leadUpdatedAt && <div className="text-[11px] text-muted-foreground">Updated {timeAgo(l.leadUpdatedAt)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
