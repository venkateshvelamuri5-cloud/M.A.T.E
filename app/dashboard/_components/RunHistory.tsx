'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, FileDown, RotateCcw, Search } from 'lucide-react';
import { RunLog, useOfficer } from '../_lib/officer';
import { isRunLog, Module, parseRequest, safeFileName } from '../_lib/modules';
import { downloadBlob, Markdown, markdownToDocx } from '../_lib/markdown';
import { Button, Card, Chip, Dialog, EmptyState, SlotCode, formatDateTime, inputClass, timeAgo } from '../_lib/ui';

const PAGE = 8;

export function moduleForLog(log: RunLog, modules: Module[]) {
  return modules.find(m => m.agentId === log.agent_id) || null;
}

/** Past runs: searchable, with the full answer, Word download and "Run again". */
export default function RunHistory() {
  const { logs, modules } = useOfficer();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<RunLog | null>(null);

  const runs = useMemo(() => logs.filter(l => isRunLog(l.subject, l.error_message)), [logs]);
  const term = q.trim().toLowerCase();
  const shown = term
    ? runs.filter(l => {
      const m = moduleForLog(l, modules);
      return `${l.subject} ${parseRequest(l.email_request).requirement} ${m?.name || ''} ${m?.code || ''}`.toLowerCase().includes(term);
    })
    : runs;

  return (
    <section className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Your history</h2>
        <div className="relative sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input id="history-search" value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search past requests" className={`${inputClass} pl-9`} />
        </div>
      </div>
      <Card>
        {shown.length === 0 ? (
          <EmptyState>{runs.length === 0 ? 'Your answers will be listed here, from the web and by email.' : 'No past requests match your search.'}</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {shown.slice(0, limit).map(l => {
              const m = moduleForLog(l, modules);
              const req = parseRequest(l.email_request).requirement;
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => setOpen(l)} className="w-full text-left px-4 sm:px-5 py-3 hover:bg-muted/40 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 items-center">
                    <span className="text-sm font-medium truncate">{req || l.subject}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap" title={new Date(l.created_at).toUTCString()}>{timeAgo(l.created_at)}</span>
                    <span className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      {m ? <><SlotCode code={m.code} /> {m.name}</> : l.subject}
                      {l.routing_layer && l.routing_layer !== 'Web Portal UI' && <span>· by email</span>}
                    </span>
                    <span>{l.status === 'Failed' ? <Chip tone="red">Failed</Chip> : <Chip tone="green">Done</Chip>}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {shown.length > limit && <div className="flex justify-center"><Button size="sm" onClick={() => setLimit(n => n + PAGE * 2)}>Show more</Button></div>}
      <RunDialog log={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function RunDialog({ log, onClose }: { log: RunLog | null; onClose: () => void }) {
  const router = useRouter();
  const { modules, toast } = useOfficer();
  if (!log) return <Dialog open={false} onClose={onClose} title=""><span /></Dialog>;
  const m = moduleForLog(log, modules);
  const { requirement, mustInclude } = parseRequest(log.email_request);
  const answer = log.email_response || '';

  const copy = async () => {
    try { await navigator.clipboard.writeText(answer); toast('Answer copied.'); } catch { toast('Copy isn\'t available here. Select the text instead.', 'error'); }
  };
  const word = async () => {
    try {
      const title = m ? `${m.code} ${m.name}` : log.subject;
      downloadBlob(await markdownToDocx(title, answer), `${safeFileName(title)}_${log.created_at.slice(0, 10)}.docx`);
    } catch (err) {
      toast(`Couldn't make the Word file: ${(err as Error).message}`, 'error');
    }
  };
  const again = () => {
    if (!m) return;
    const params = new URLSearchParams({ q: requirement });
    if (mustInclude) params.set('inc', mustInclude);
    router.push(`/dashboard/modules/${m.code}?${params.toString()}`);
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={m ? <span className="flex items-center gap-2"><SlotCode code={m.code} /> {m.name}</span> : log.subject}
      subtitle={<span title={new Date(log.created_at).toUTCString()}>{formatDateTime(log.created_at)}{log.routing_layer && log.routing_layer !== 'Web Portal UI' ? ' · by email' : ''}</span>}
      footer={<>
        {answer && <Button onClick={copy}><Copy className="w-4 h-4" /> Copy</Button>}
        {answer && <Button onClick={word}><FileDown className="w-4 h-4" /> Word</Button>}
        {m && !m.paused && requirement && <Button variant="primary" onClick={again}><RotateCcw className="w-4 h-4" /> Run again</Button>}
      </>}
    >
      <div className="space-y-5">
        {requirement && (
          <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">You asked</div>
            <div className="whitespace-pre-wrap">{requirement}</div>
            {mustInclude && <div className="text-xs text-muted-foreground whitespace-pre-wrap pt-1">Must include: {mustInclude}</div>}
          </div>
        )}
        {log.status === 'Failed'
          ? <p className="text-sm text-red-700">This run didn&apos;t finish, so it didn&apos;t use up one of your runs. Try again, or contact the M.A.T.E team if it keeps failing.</p>
          : answer ? <Markdown text={answer} /> : <p className="text-sm text-muted-foreground">No answer was saved for this run.</p>}
      </div>
    </Dialog>
  );
}
