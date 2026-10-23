'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../src/supabase-client';
import { AGENT_SLOTS_TEMPLATE } from '../_lib/slots';
import { Button, Card, Chip, EmptyState, PageHeader, inputClass } from '../_lib/ui';

interface ActivityLog {
  id: string;
  created_at: string;
  subject: string;
  status: string;
  error_message?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  run_cost?: number | null;
  routing_layer?: string | null;
  profiles?: { email: string } | null;
  agents?: { name: string; slot_code?: string | null } | null;
}

const PAGE_SIZE = 15;
const MAX_ROWS = 100;

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [status, setStatus] = useState('All');
  const [slot, setSlot] = useState('All');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    // Filters can arrive from Overview links, e.g. ?status=Failed&slot=D2
    const params = new URLSearchParams(window.location.search);
    if (params.get('status')) setStatus(params.get('status')!);
    if (params.get('slot')) setSlot(params.get('slot')!);
    if (params.get('q')) setKeyword(params.get('q')!);
    (async () => {
      const { data } = await supabase
        .from('interactions_log')
        .select('id, created_at, subject, status, error_message, input_tokens, output_tokens, run_cost, routing_layer, profiles(email), agents(name, slot_code)')
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS);
      setLogs((data || []) as any[]);
    })();
  }, []);

  useEffect(() => { setPage(1); }, [status, slot, keyword]);

  const filtered = (logs || []).filter(log => {
    if (status !== 'All' && log.status !== status) return false;
    if (slot !== 'All' && log.agents?.slot_code !== slot) return false;
    const q = keyword.trim().toLowerCase();
    if (q) {
      const hay = `${log.profiles?.email || ''} ${log.subject || ''} ${log.error_message || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PageHeader title="Activity" subtitle={`The latest ${MAX_ROWS} runs: who asked, which agent answered, what it cost and anything that failed.`} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select id="activity-status" aria-label="Status" value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
          <option value="All">All statuses</option>
          <option value="Completed">Completed</option>
          <option value="Failed">Failed</option>
        </select>
        <select id="activity-slot" aria-label="Agent" value={slot} onChange={e => setSlot(e.target.value)} className={inputClass}>
          <option value="All">All agents</option>
          {AGENT_SLOTS_TEMPLATE.filter(s => s.name).map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
        </select>
        <input id="activity-search" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Search email, subject or error" className={inputClass} />
      </div>

      <Card className="overflow-x-auto">
        {logs === null ? <EmptyState>Loading activity…</EmptyState> : shown.length === 0 ? <EmptyState>No runs match these filters.</EmptyState> : (
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 font-semibold">Officer</th>
                <th className="px-4 py-2.5 font-semibold">Subject</th>
                <th className="px-4 py-2.5 font-semibold">Agent</th>
                <th className="px-4 py-2.5 font-semibold">Tokens &amp; cost</th>
                <th className="px-4 py-2.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map(log => {
                const isFeedback = log.error_message?.startsWith('User Feedback:');
                return (
                  <tr key={log.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium">{log.profiles?.email || 'Guest'}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate" title={log.subject}>{log.subject}</td>
                    <td className="px-4 py-3">
                      {log.agents?.name ? <Chip tone="indigo">{log.agents.slot_code ? `${log.agents.slot_code} ` : ''}{log.agents.name}</Chip> : <span className="text-xs text-muted-foreground">None</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {(log.input_tokens || 0).toLocaleString()} in / {(log.output_tokens || 0).toLocaleString()} out
                      <div>${log.run_cost ? Number(log.run_cost).toFixed(4) : '0.0000'} · {log.routing_layer || 'n/a'}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {isFeedback ? (
                        <>
                          <Chip tone="indigo">Feedback</Chip>
                          <div className="text-xs mt-1">{log.error_message!.replace('User Feedback:', '').trim()}</div>
                        </>
                      ) : (
                        <>
                          <Chip tone={log.status === 'Completed' ? 'green' : log.status === 'Failed' ? 'red' : 'grey'}>{log.status}</Chip>
                          {log.error_message && <div className="text-xs text-red-700 font-mono mt-1 break-words">{log.error_message}</div>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(filtered.length, page * PAGE_SIZE)} of {filtered.length}</span>
          <div className="flex gap-2">
            <Button size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </>
  );
}
