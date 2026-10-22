'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../src/supabase-client';
import { BarChart3, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface AnalyticsLog {
  id: string;
  created_at: string;
  status: string;
  run_cost?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  routing_layer?: string | null;
  user_id: string;
  profiles?: { email: string; full_name?: string | null } | null;
  agents?: { name: string; slot_code?: string | null } | null;
}

const RANGE_OPTIONS = [7, 30, 90];
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;

const isFailed = (status: string) => status === 'Failed';

const dayKey = (d: Date) => d.toISOString().substring(0, 10);

const formatCost = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

const formatChannel = (layer?: string | null) => {
  if (!layer) return 'Unknown';
  if (layer === 'Web Portal UI') return 'Web Portal';
  if (layer === 'cached_duplicate') return 'Email (duplicate)';
  return `Email (${layer})`;
};

export default function AnalyticsTab() {
  const [rangeDays, setRangeDays] = useState(30);
  const [logs, setLogs] = useState<AnalyticsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs(rangeDays);
  }, [rangeDays]);

  const fetchLogs = async (days: number) => {
    setLoading(true);
    setError(null);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const rows: AnalyticsLog[] = [];
    let from = 0;
    try {
      // Supabase caps each response at 1000 rows, so page through the window
      while (from < MAX_ROWS) {
        const { data, error: qErr } = await supabase
          .from('interactions_log')
          .select('id, created_at, status, run_cost, input_tokens, output_tokens, routing_layer, user_id, profiles(email, full_name), agents(name, slot_code)')
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (qErr) throw qErr;
        rows.push(...((data || []) as any[]));
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setTruncated(from >= MAX_ROWS);
      setLogs(rows);
    } catch (err) {
      console.error('Failed to load analytics logs:', err);
      setError((err as Error).message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = logs.length;
    const failed = logs.filter(l => isFailed(l.status)).length;
    const cost = logs.reduce((sum, l) => sum + (Number(l.run_cost) || 0), 0);
    const tokens = logs.reduce((sum, l) => sum + (Number(l.input_tokens) || 0) + (Number(l.output_tokens) || 0), 0);
    const activeUsers = new Set(logs.map(l => l.user_id)).size;

    // Daily trend, zero-filled so quiet days still show up
    const daily = new Map<string, { completed: number; failed: number }>();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      daily.set(dayKey(d), { completed: 0, failed: 0 });
    }
    logs.forEach(l => {
      const bucket = daily.get(dayKey(new Date(l.created_at)));
      if (!bucket) return;
      if (isFailed(l.status)) bucket.failed++;
      else bucket.completed++;
    });
    const days = Array.from(daily.entries()).map(([day, v]) => ({ day, ...v, total: v.completed + v.failed }));
    const peakDay = Math.max(1, ...days.map(d => d.total));

    // Per module
    const modules = new Map<string, { label: string; runs: number; failed: number; cost: number }>();
    logs.forEach(l => {
      const key = l.agents?.slot_code || l.agents?.name || 'Unrouted';
      const label = l.agents
        ? `${l.agents.slot_code ? `${l.agents.slot_code} · ` : ''}${l.agents.name}`
        : 'Unrouted / General';
      const m = modules.get(key) || { label, runs: 0, failed: 0, cost: 0 };
      m.runs++;
      if (isFailed(l.status)) m.failed++;
      m.cost += Number(l.run_cost) || 0;
      modules.set(key, m);
    });
    const moduleRows = Array.from(modules.values()).sort((a, b) => b.runs - a.runs);

    // Top users
    const users = new Map<string, { email: string; name: string; runs: number; failed: number; cost: number; last: string }>();
    logs.forEach(l => {
      const u = users.get(l.user_id) || {
        email: l.profiles?.email || 'Unknown',
        name: l.profiles?.full_name || '',
        runs: 0,
        failed: 0,
        cost: 0,
        last: l.created_at
      };
      u.runs++;
      if (isFailed(l.status)) u.failed++;
      u.cost += Number(l.run_cost) || 0;
      if (l.created_at > u.last) u.last = l.created_at;
      users.set(l.user_id, u);
    });
    const userRows = Array.from(users.values()).sort((a, b) => b.runs - a.runs).slice(0, 10);

    // Channels
    const channels = new Map<string, number>();
    logs.forEach(l => {
      const c = formatChannel(l.routing_layer);
      channels.set(c, (channels.get(c) || 0) + 1);
    });
    const channelRows = Array.from(channels.entries()).map(([name, runs]) => ({ name, runs })).sort((a, b) => b.runs - a.runs);

    return { total, failed, cost, tokens, activeUsers, days, peakDay, moduleRows, userRows, channelRows };
  }, [logs, rangeDays]);

  const failureRate = stats.total ? (stats.failed / stats.total) * 100 : 0;
  const maxModuleRuns = Math.max(1, ...stats.moduleRows.map(m => m.runs));
  const hovered = stats.days.find(d => d.day === hoverDay);

  return (
    <div className="bg-card border border-border p-8 rounded-xl shadow-sm font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-lg font-black text-foreground font-display flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#575ECF]" />
            Usage Analytics
          </h2>
          <p className="text-muted-foreground text-xs font-medium mt-1">
            Runs, failures, and cost across modules and officers, from the interactions log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setRangeDays(d)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold border transition ${
                rangeDays === d
                  ? 'bg-[#575ECF] text-white border-[#575ECF]'
                  : 'bg-card text-muted-foreground border-border hover:border-[#575ECF]'
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={() => fetchLogs(rangeDays)}
            className="p-1.5 rounded-full border border-border text-muted-foreground hover:text-[#575ECF] hover:border-[#575ECF] transition"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-300 text-rose-700 text-xs p-3 rounded-lg mb-6 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground animate-pulse font-medium">
          Loading analytics...
        </div>
      ) : (
        <>
          {truncated && (
            <p className="text-[10px] text-muted-foreground italic mb-4">
              Showing the most recent {MAX_ROWS.toLocaleString()} runs in this window.
            </p>
          )}

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            {[
              { label: 'Runs', value: stats.total.toLocaleString() },
              { label: 'Failure Rate', value: `${failureRate.toFixed(1)}%`, sub: `${stats.failed} failed` },
              { label: 'AI Cost', value: formatCost(stats.cost) },
              { label: 'Tokens', value: stats.tokens.toLocaleString() },
              { label: 'Active Officers', value: stats.activeUsers.toLocaleString() }
            ].map(k => (
              <div key={k.label} className="bg-zinc-50 border border-border rounded-lg p-4">
                <span className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{k.label}</span>
                <span className="block text-xl font-black text-foreground mt-1">{k.value}</span>
                {k.sub && <span className="block text-[10px] text-muted-foreground mt-0.5">{k.sub}</span>}
              </div>
            ))}
          </div>

          {/* Daily trend */}
          <div className="mb-8">
            <div className="flex justify-between items-end mb-3">
              <h3 className="text-sm font-bold text-foreground font-display">Daily Runs</h3>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#575ECF]" />
                  <CheckCircle2 className="w-3 h-3" /> Completed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                  <AlertCircle className="w-3 h-3" /> Failed
                </span>
              </div>
            </div>
            <div className="h-5 text-[10px] text-muted-foreground font-medium mb-1">
              {hovered
                ? `${hovered.day}: ${hovered.total} runs (${hovered.completed} completed, ${hovered.failed} failed)`
                : `Peak ${stats.total ? stats.peakDay : 0} runs/day`}
            </div>
            <div className="flex items-end h-36 border-b border-border" onMouseLeave={() => setHoverDay(null)}>
              {stats.days.map(d => (
                <div
                  key={d.day}
                  onMouseEnter={() => setHoverDay(d.day)}
                  className={`flex-1 h-full flex flex-col justify-end px-px cursor-default ${hoverDay === d.day ? 'bg-zinc-100' : ''}`}
                  title={`${d.day}: ${d.completed} completed, ${d.failed} failed`}
                >
                  {d.failed > 0 && (
                    <div
                      className={`bg-rose-500 ${d.completed === 0 ? 'rounded-t' : 'rounded-t mb-[2px]'}`}
                      style={{ height: `${(d.failed / stats.peakDay) * 100}%` }}
                    />
                  )}
                  {d.completed > 0 && (
                    <div
                      className={`bg-[#575ECF] ${d.failed === 0 ? 'rounded-t' : ''}`}
                      style={{ height: `${(d.completed / stats.peakDay) * 100}%` }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1 font-mono">
              <span>{stats.days[0]?.day}</span>
              <span>{stats.days[stats.days.length - 1]?.day}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Per module */}
            <div className="lg:col-span-2">
              <h3 className="text-sm font-bold text-foreground font-display mb-3">Runs by Module</h3>
              {stats.moduleRows.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-4">No runs in this window.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-bold uppercase tracking-wider text-[9px]">
                      <th className="py-2 pr-3">Module</th>
                      <th className="py-2 pr-3 w-2/5">Runs</th>
                      <th className="py-2 pr-3 text-right">Failed</th>
                      <th className="py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.moduleRows.map(m => (
                      <tr key={m.label} className="border-b border-zinc-100">
                        <td className="py-2 pr-3 font-semibold text-zinc-700">{m.label}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#575ECF] rounded-full" style={{ width: `${(m.runs / maxModuleRuns) * 100}%` }} />
                            </div>
                            <span className="font-mono text-zinc-600 w-10 text-right">{m.runs}</span>
                          </div>
                        </td>
                        <td className={`py-2 pr-3 text-right font-mono ${m.failed > 0 ? 'text-rose-700 font-bold' : 'text-muted-foreground'}`}>
                          {m.failed} ({((m.failed / m.runs) * 100).toFixed(0)}%)
                        </td>
                        <td className="py-2 text-right font-mono text-muted-foreground">{formatCost(m.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Channels */}
            <div>
              <h3 className="text-sm font-bold text-foreground font-display mb-3">Channels</h3>
              {stats.channelRows.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-4">No runs in this window.</div>
              ) : (
                <div className="space-y-3">
                  {stats.channelRows.map(c => (
                    <div key={c.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-zinc-700">{c.name}</span>
                        <span className="font-mono text-muted-foreground">
                          {c.runs} ({((c.runs / stats.total) * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#575ECF] rounded-full" style={{ width: `${(c.runs / stats.total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top users */}
          <div className="mt-8">
            <h3 className="text-sm font-bold text-foreground font-display mb-3">Top Officers</h3>
            {stats.userRows.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-4">No runs in this window.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-bold uppercase tracking-wider text-[9px]">
                      <th className="py-2 pr-3">Officer</th>
                      <th className="py-2 pr-3 text-right">Runs</th>
                      <th className="py-2 pr-3 text-right">Failed</th>
                      <th className="py-2 pr-3 text-right">Cost</th>
                      <th className="py-2 text-right">Last Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.userRows.map(u => (
                      <tr key={u.email} className="border-b border-zinc-100">
                        <td className="py-2 pr-3">
                          <div className="font-semibold text-zinc-700">{u.name || 'N/A'}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{u.email}</div>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-zinc-700">{u.runs}</td>
                        <td className={`py-2 pr-3 text-right font-mono ${u.failed > 0 ? 'text-rose-700 font-bold' : 'text-muted-foreground'}`}>{u.failed}</td>
                        <td className="py-2 pr-3 text-right font-mono text-muted-foreground">{formatCost(u.cost)}</td>
                        <td className="py-2 text-right text-[10px] text-muted-foreground">
                          {new Date(u.last).toISOString().replace('T', ' ').substring(0, 16)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
