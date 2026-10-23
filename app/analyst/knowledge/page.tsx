'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { supabase } from '../../../src/supabase-client';
import { requestIngestion } from '../../../src/services/documents/client';
import { useAnalyst } from '../_lib/context';
import { Agent, KnowledgeFile } from '../_lib/slots';
import { logChange } from '../_lib/audit';
import { Button, Card, EmptyState, PageHeader, SlotCode, ingestChip, inputClass } from '../_lib/ui';

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed' | 'unprocessed';
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'ready', label: 'Ready' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
  { value: 'unprocessed', label: 'Not processed' }
];
const SHARED = '__shared__';
const ACCEPT = '.pdf,.docx,.doc,.txt,.md,.rtf,.xlsx,.xls,.csv';

const statusOf = (f: KnowledgeFile): StatusFilter =>
  f.ingest_status === 'ready' ? 'ready'
    : f.ingest_status === 'failed' ? 'failed'
      : f.ingest_status === 'queued' || f.ingest_status === 'processing' ? 'processing'
        : 'unprocessed';

export default function KnowledgePage() {
  const { toast, confirm, deferred } = useAnalyst();
  const [files, setFiles] = useState<KnowledgeFile[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [uploads, setUploads] = useState<{ name: string; state: 'uploading' | 'done' | 'error' }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // files waiting out their undo window
  const [backfilling, setBackfilling] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [{ data: fileRows }, { data: agentRows }] = await Promise.all([
      supabase.from('user_files').select('*').or('file_type.eq.knowledge_base,agent_id.not.is.null').order('created_at', { ascending: false }),
      supabase.from('agents').select('id, name, slot_code, status, is_locked').order('slot_code')
    ]);
    setFiles((fileRows || []) as KnowledgeFile[]);
    setAgents((agentRows || []) as Agent[]);
  };

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status') as StatusFilter | null;
    if (s && STATUS_FILTERS.some(f => f.value === s)) setStatus(s);
    load();
  }, []);

  // Refresh while anything is processing, so statuses update without a reload.
  const anyProcessing = (files || []).some(f => statusOf(f) === 'processing');
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [anyProcessing]);

  const agentById = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);

  const visible = (files || []).filter(f => {
    if (hidden.has(f.id)) return false;
    if (status !== 'all' && statusOf(f) !== status) return false;
    if (agentFilter === SHARED && f.agent_id) return false;
    if (agentFilter !== 'all' && agentFilter !== SHARED && f.agent_id !== agentFilter) return false;
    return !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const counts = (files || []).reduce((acc, f) => { acc.all++; acc[statusOf(f)]++; return acc; }, { all: 0, ready: 0, processing: 0, failed: 0, unprocessed: 0 } as Record<StatusFilter, number>);
  const totalSections = (files || []).reduce((n, f) => n + (f.section_count || 0), 0);

  const uploadFiles = async (list: FileList | File[]) => {
    const items = Array.from(list);
    if (!items.length) return;
    setUploads(u => [...u, ...items.map(f => ({ name: f.name, state: 'uploading' as const }))]);
    const { data: { session } } = await supabase.auth.getSession();
    for (const file of items) {
      const mark = (state: 'done' | 'error') => setUploads(u => u.map(x => x.name === file.name && x.state === 'uploading' ? { ...x, state } : x));
      try {
        const storagePath = `general/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from('knowledge-base').upload(storagePath, file);
        if (upErr) throw upErr;
        const { data, error } = await supabase.from('user_files').insert({
          user_id: session?.user?.id,
          name: file.name,
          storage_path: storagePath,
          file_type: 'knowledge_base',
          file_size_mb: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
          agent_id: null
        }).select().single();
        if (error) throw error;
        requestIngestion(data.id).then(load);
        mark('done');
        await logChange({ action: 'file.upload', entityType: 'file', entityId: data.id, summary: `Uploaded ${file.name} to the shared library` });
      } catch (err) {
        mark('error');
        toast(`Couldn't upload ${file.name}: ${(err as Error).message}`, 'error');
      }
    }
    await load();
    setTimeout(() => setUploads(u => u.filter(x => x.state === 'uploading')), 4000);
  };

  const changeLink = async (file: KnowledgeFile, value: string) => {
    const agentId = value === SHARED ? null : value;
    const { error } = await supabase.from('user_files')
      .update(agentId ? { agent_id: agentId } : { agent_id: null, file_type: 'knowledge_base' })
      .eq('id', file.id);
    if (error) { toast(`Couldn't change who uses ${file.name}: ${error.message}`, 'error'); return; }
    const a = agentId ? agentById.get(agentId) : null;
    const summary = a ? `Linked ${file.name} to ${a.slot_code} ${a.name}` : `Made ${file.name} shared with all agents`;
    await logChange({ action: 'file.link', entityType: 'file', entityId: file.id, summary });
    toast(a ? `${file.name} is now used only by ${a.slot_code}.` : `${file.name} is now shared with every agent.`);
    load();
  };

  const retry = async (file: KnowledgeFile) => {
    setFiles(fs => (fs || []).map(f => f.id === file.id ? { ...f, ingest_status: 'processing', ingest_error: null } : f));
    await logChange({ action: 'file.retry', entityType: 'file', entityId: file.id, summary: `Reprocessed ${file.name}` });
    await requestIngestion(file.id);
    await load();
  };

  const processAll = async () => {
    setBackfilling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/documents/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ backfill: true, limit: 20 })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `status ${res.status}`);
      const failed = (result.processed || []).filter((r: any) => r.status === 'failed').length;
      toast(`Processed ${result.processed?.length || 0} document(s)${failed ? `, ${failed} failed` : ''}.${result.remaining ? ` ${result.remaining} still waiting: run it again.` : ''}`, failed ? 'error' : 'success');
      await logChange({ action: 'file.backfill', entityType: 'file', summary: `Processed ${result.processed?.length || 0} waiting document(s)` });
      load();
    } catch (err) {
      toast(`Processing didn't complete: ${(err as Error).message}`, 'error');
    } finally {
      setBackfilling(false);
    }
  };

  const remove = async (file: KnowledgeFile) => {
    const a = file.agent_id ? agentById.get(file.agent_id) : null;
    const ok = await confirm({
      title: `Delete ${file.name}?`,
      body: a
        ? <>It's linked to <b>{a.slot_code} {a.name}</b>, which will stop using it. The file is removed from storage.</>
        : <>Every agent can currently use it. The file is removed from storage.</>,
      confirmLabel: 'Delete document',
      danger: true
    });
    if (!ok) return;
    setHidden(h => new Set(h).add(file.id));
    deferred({
      message: `Deleting ${file.name}`,
      onUndo: () => setHidden(h => { const n = new Set(h); n.delete(file.id); return n; }),
      commit: async () => {
        const { error: storageErr } = await supabase.storage.from('knowledge-base').remove([file.storage_path]);
        if (storageErr) console.warn('Storage delete failed:', storageErr.message);
        const { error } = await supabase.from('user_files').delete().eq('id', file.id);
        if (error) {
          setHidden(h => { const n = new Set(h); n.delete(file.id); return n; });
          throw error;
        }
        await logChange({ action: 'file.delete', entityType: 'file', entityId: file.id, summary: `Deleted ${file.name}${a ? ` (was linked to ${a.slot_code})` : ''}` });
        load();
      }
    });
  };

  return (
    <>
      <PageHeader
        title="Knowledge library"
        subtitle={files ? `${counts.all} documents · ${totalSections.toLocaleString()} searchable sections` : 'Loading…'}
        actions={<>
          {counts.unprocessed + counts.failed > 0 && (
            <Button onClick={processAll} disabled={backfilling}><RefreshCw className={`w-4 h-4 ${backfilling ? 'animate-spin' : ''}`} /> {backfilling ? 'Processing…' : `Process ${counts.unprocessed + counts.failed} waiting`}</Button>
          )}
          <Button variant="primary" onClick={() => fileInput.current?.click()}><Upload className="w-4 h-4" /> Upload documents</Button>
          <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }} />
        </>}
      />

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input id="kb-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search documents" className={`${inputClass} pl-9`} />
        </div>
        <select id="kb-status" aria-label="Status" value={status} onChange={e => setStatus(e.target.value as StatusFilter)} className={`${inputClass} md:w-48`}>
          {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}{files ? ` (${counts[s.value]})` : ''}</option>)}
        </select>
        <select id="kb-agent" aria-label="Used by" value={agentFilter} onChange={e => setAgentFilter(e.target.value)} className={`${inputClass} md:w-56`}>
          <option value="all">Any agent</option>
          <option value={SHARED}>Shared with all agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.slot_code} {a.name}</option>)}
        </select>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-xl px-4 py-5 text-center text-sm transition ${dragging ? 'border-[#575ECF] bg-indigo-50/60 text-[#575ECF]' : 'border-border text-muted-foreground'}`}
      >
        Drop PDF, Word, Excel or text files here. New uploads are shared with every agent; link them to one agent below.
        {uploads.length > 0 && (
          <ul className="mt-3 space-y-1 text-left max-w-md mx-auto">
            {uploads.map((u, i) => (
              <li key={i} className="flex justify-between gap-3 text-xs">
                <span className="truncate text-foreground">{u.name}</span>
                <span className={u.state === 'error' ? 'text-red-600' : u.state === 'done' ? 'text-emerald-700' : 'text-muted-foreground'}>
                  {u.state === 'uploading' ? 'Uploading…' : u.state === 'done' ? 'Uploaded' : 'Failed'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card className="overflow-x-auto">
        {files === null ? <EmptyState>Loading documents…</EmptyState> : visible.length === 0 ? (
          <EmptyState>{counts.all === 0 ? 'No documents yet. Upload SMS manuals, checklists or circulars for agents to use.' : 'No documents match these filters.'}</EmptyState>
        ) : (
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-4 py-2.5 font-semibold">Document</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Used by</th>
                <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map(f => {
                const st = statusOf(f);
                const linkedAgent = f.agent_id ? agentById.get(f.agent_id) : null;
                return (
                  <tr key={f.id} className="align-top">
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="font-medium truncate" title={f.name}>{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.file_size_mb} MB · added {new Date(f.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-3">
                      {ingestChip(f)}
                      <div className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                        {st === 'ready' && <>{f.page_count ? `${f.page_count} pages, ` : ''}{f.section_count} sections, ~{(f.token_count || 0).toLocaleString()} tokens{f.ocr_page_count ? `, ${f.ocr_page_count} pages read by OCR` : ''}</>}
                        {st === 'failed' && <span className="text-red-700">{f.ingest_error || 'Processing failed.'}</span>}
                        {st === 'processing' && 'Splitting into searchable sections…'}
                        {st === 'unprocessed' && 'Read whole on every question until processed'}
                        {st === 'ready' && f.ingest_error && <div className="text-amber-700">{f.ingest_error}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Who uses ${f.name}`}
                        value={f.agent_id || SHARED}
                        onChange={e => changeLink(f, e.target.value)}
                        className={`${inputClass} py-1.5 w-56`}
                      >
                        <option value={SHARED}>All agents (shared)</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.slot_code} {a.name}</option>)}
                      </select>
                      {linkedAgent && (
                        <Link href={`/analyst/agents/${linkedAgent.slot_code}`} className="block mt-1 text-xs text-[#575ECF] hover:underline">
                          Open <SlotCode code={linkedAgent.slot_code || ''} />
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {(st === 'failed' || st === 'unprocessed') && <Button size="sm" onClick={() => retry(f)}>{st === 'failed' ? 'Retry' : 'Process'}</Button>}
                        <Button size="sm" variant="ghost" onClick={() => remove(f)} aria-label={`Delete ${f.name}`}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
