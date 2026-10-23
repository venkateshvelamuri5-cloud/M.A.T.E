'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../src/supabase-client';
import { AuditEntity, AuditEntry } from '../_lib/audit';
import { Button, Card, Chip, EmptyState, PageHeader, formatDateTime, inputClass } from '../_lib/ui';

const PAGE = 100;
const TYPE_LABEL: Record<AuditEntity, string> = { agent: 'Agent', file: 'Document', user: 'Officer', setting: 'Setting' };
const TYPE_TONE: Record<AuditEntity, 'indigo' | 'green' | 'amber' | 'grey'> = { agent: 'indigo', file: 'green', user: 'amber', setting: 'grey' };

export default function ChangesPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [type, setType] = useState<'all' | AuditEntity>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async (append = false) => {
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false });
    if (type !== 'all') q = q.eq('entity_type', type);
    const from = append ? (entries?.length || 0) : 0;
    const { data, error: err } = await q.range(from, from + PAGE - 1);
    if (err) {
      setError(err.message.includes('audit_log') ? 'The change log table isn\'t set up yet. Run the latest database migration.' : err.message);
      setEntries([]);
      return;
    }
    setError(null);
    setEntries(prev => append ? [...(prev || []), ...(data as AuditEntry[])] : (data as AuditEntry[]));
    setHasMore((data || []).length === PAGE);
  };

  useEffect(() => { load(); }, [type]);

  const q = query.trim().toLowerCase();
  const shown = (entries || []).filter(e => !q || `${e.summary} ${e.actor_email || ''}`.toLowerCase().includes(q));

  return (
    <>
      <PageHeader title="Change log" subtitle="Every change made in the console: agents, documents, officers and settings." />

      <div className="flex flex-col sm:flex-row gap-2">
        <select id="changes-type" aria-label="Type" value={type} onChange={e => setType(e.target.value as any)} className={`${inputClass} sm:w-48`}>
          <option value="all">All changes</option>
          {(Object.keys(TYPE_LABEL) as AuditEntity[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}s</option>)}
        </select>
        <input id="changes-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by what changed or who" className={inputClass} />
      </div>

      <Card>
        {entries === null ? <EmptyState>Loading changes…</EmptyState> : error ? <EmptyState>{error}</EmptyState> : shown.length === 0 ? (
          <EmptyState>{entries.length === 0 ? 'No changes recorded yet.' : 'No changes match your search.'}</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map(e => (
              <li key={e.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-xs text-muted-foreground font-mono sm:w-44 shrink-0">{formatDateTime(e.created_at)}</span>
                <span className="shrink-0"><Chip tone={TYPE_TONE[e.entity_type] || 'grey'}>{TYPE_LABEL[e.entity_type] || e.entity_type}</Chip></span>
                <span className="flex-1 min-w-0 text-sm">
                  {e.entity_type === 'agent' && e.entity_id && /^[A-F][1-6]$/.test(e.entity_id)
                    ? <Link href={`/analyst/agents/${e.entity_id}`} className="hover:underline">{e.summary}</Link>
                    : e.summary}
                </span>
                <span className="text-xs text-muted-foreground truncate sm:max-w-[220px]">{e.actor_email || 'Unknown'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {hasMore && !q && <div className="flex justify-center"><Button onClick={() => load(true)}>Load older changes</Button></div>}
    </>
  );
}
