'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../src/supabase-client';
import AnalyticsTab from './AnalyticsTab';
import { Card, PageHeader, SlotCode, timeAgo } from './_lib/ui';
import { Agent, agentStatus } from './_lib/slots';
import { AuditEntry } from './_lib/audit';

interface AttentionItem {
  tone: 'red' | 'amber';
  title: React.ReactNode;
  detail?: string;
  href: string;
  cta: string;
}

const NEAR_LIMIT = 0.9;

export default function OverviewPage() {
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [changes, setChanges] = useState<AuditEntry[]>([]);

  useEffect(() => {
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [failedRunsRes, agentsRes, filesRes, limitsRes, feedbackRes, changesRes] = await Promise.all([
        supabase.from('interactions_log').select('agent_id, error_message, agents(name, slot_code)').eq('status', 'Failed').gte('created_at', weekAgo).limit(1000),
        supabase.from('agents').select('id, name, slot_code, status, is_locked'),
        supabase.from('user_files').select('id, name, ingest_status, ingest_error').or('file_type.eq.knowledge_base,agent_id.not.is.null'),
        supabase.from('usage_limits').select('interactions_count, max_interactions'),
        supabase.from('interactions_log').select('id', { count: 'exact', head: true }).like('error_message', 'User Feedback:%').gte('created_at', weekAgo),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(6)
      ]);

      const next: AttentionItem[] = [];

      // Failed runs, grouped by agent, worst first
      const failed = (failedRunsRes.data || []).filter((r: any) => !r.error_message?.startsWith('User Feedback:'));
      const byAgent = new Map<string, { name: string; slot?: string; count: number; lastError?: string }>();
      for (const r of failed as any[]) {
        const key = r.agents?.slot_code || r.agents?.name || 'unrouted';
        const g = byAgent.get(key) || { name: r.agents?.name || 'No agent (failed before routing)', slot: r.agents?.slot_code, count: 0, lastError: r.error_message };
        g.count++;
        byAgent.set(key, g);
      }
      Array.from(byAgent.values()).sort((a, b) => b.count - a.count).slice(0, 3).forEach(g => next.push({
        tone: 'red',
        title: <>{g.count} failed run{g.count === 1 ? '' : 's'} on {g.slot && <SlotCode code={g.slot} />} {g.name}</>,
        detail: g.lastError ? `Last 7 days · "${g.lastError.slice(0, 80)}"` : 'Last 7 days',
        href: `/analyst/activity?status=Failed${g.slot ? `&slot=${g.slot}` : ''}`,
        cta: 'View runs'
      }));

      const files = filesRes.data || [];
      const failedDocs = files.filter(f => f.ingest_status === 'failed');
      if (failedDocs.length) next.push({
        tone: 'red',
        title: `${failedDocs.length} document${failedDocs.length === 1 ? '' : 's'} failed processing`,
        detail: failedDocs.slice(0, 2).map(f => f.name).join(', '),
        href: '/analyst/knowledge?status=failed',
        cta: 'Retry'
      });
      const unprocessed = files.filter(f => !f.ingest_status);
      if (unprocessed.length) next.push({
        tone: 'amber',
        title: `${unprocessed.length} document${unprocessed.length === 1 ? ' hasn\'t' : 's haven\'t'} been processed yet`,
        detail: 'Agents read these whole on every query, which is slower and costs more',
        href: '/analyst/knowledge?status=unprocessed',
        cta: 'Process'
      });

      const nearLimit = (limitsRes.data || []).filter(l => l.max_interactions > 0 && l.interactions_count / l.max_interactions >= NEAR_LIMIT);
      if (nearLimit.length) next.push({
        tone: 'amber',
        title: `${nearLimit.length} officer${nearLimit.length === 1 ? ' is' : 's are'} at 90% or more of their limit`,
        href: '/analyst/people',
        cta: 'Review'
      });

      const paused = ((agentsRes.data || []) as Agent[]).filter(a => agentStatus(a) === 'paused');
      if (paused.length) next.push({
        tone: 'amber',
        title: `${paused.length} agent${paused.length === 1 ? ' is' : 's are'} paused`,
        detail: paused.slice(0, 4).map(a => `${a.slot_code} ${a.name}`).join(', '),
        href: '/analyst/agents',
        cta: 'View'
      });

      if (feedbackRes.count) next.push({
        tone: 'amber',
        title: `${feedbackRes.count} feedback note${feedbackRes.count === 1 ? '' : 's'} from officers this week`,
        href: '/analyst/activity?q=User%20Feedback',
        cta: 'Read'
      });

      setItems(next);
      setChanges((changesRes.data || []) as AuditEntry[]);
    })();
  }, []);

  return (
    <>
      <PageHeader title="Overview" subtitle="What needs your attention, and how M.A.T.E is being used." />

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-2">Needs attention</h2>
          {items === null ? (
            <p className="text-sm text-muted-foreground py-4">Checking…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nothing needs attention right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((it, i) => (
                <li key={i} className="flex items-start gap-3 py-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${it.tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{it.title}</div>
                    {it.detail && <div className="text-xs text-muted-foreground mt-0.5 truncate">{it.detail}</div>}
                  </div>
                  <Link href={it.href} className="text-sm font-semibold text-[#575ECF] hover:underline shrink-0">{it.cta}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Recent changes</h2>
            <Link href="/analyst/changes" className="text-sm font-semibold text-[#575ECF] hover:underline">All changes</Link>
          </div>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Changes made in the console will show here.</p>
          ) : (
            <ul className="divide-y divide-border">
              {changes.map(c => (
                <li key={c.id} className="py-2.5">
                  <div className="text-sm">{c.summary}</div>
                  <div className="text-xs text-muted-foreground">{c.actor_email || 'Unknown'} · {timeAgo(c.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AnalyticsTab />
    </>
  );
}
