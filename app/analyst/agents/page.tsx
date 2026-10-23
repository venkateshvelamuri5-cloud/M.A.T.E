'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pause, Play, Search } from 'lucide-react';
import { supabase } from '../../../src/supabase-client';
import { useAnalyst } from '../_lib/context';
import { Agent, AGENT_SLOTS_TEMPLATE, CATEGORY_LETTERS, CategoryLetter, DEFAULT_CATEGORY_NAMES, agentStatus } from '../_lib/slots';
import { loadCategoryNames, setAgentStatus } from '../_lib/agents';
import { Card, PageHeader, SlotCode, StatusChip, inputClass } from '../_lib/ui';

export default function AgentsPage() {
  const { toast } = useAnalyst();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [categoryNames, setCategoryNames] = useState(DEFAULT_CATEGORY_NAMES);
  const [query, setQuery] = useState('');
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const load = async () => {
    const [{ data }, names] = await Promise.all([supabase.from('agents').select('*'), loadCategoryNames()]);
    setAgents((data || []) as Agent[]);
    setCategoryNames(names);
  };

  useEffect(() => { load(); }, []);

  const togglePause = async (e: React.MouseEvent, agent: Agent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = agentStatus(agent) === 'live' ? 'paused' : 'live';
    setBusySlot(agent.slot_code || null);
    try {
      await setAgentStatus(agent, next);
      toast(next === 'paused' ? `Paused ${agent.slot_code}. Officers see it locked until you resume it.` : `${agent.slot_code} is live again.`);
      await load();
    } catch (err) {
      toast(`Couldn't change ${agent.slot_code}: ${(err as Error).message}`, 'error');
    } finally {
      setBusySlot(null);
    }
  };

  const counts = { live: 0, paused: 0, draft: 0 };
  agents.forEach(a => counts[agentStatus(a)]++);

  const q = query.trim().toLowerCase();
  const matches = (code: string, agent?: Agent) =>
    !q || code.toLowerCase().includes(q) || (agent?.name || '').toLowerCase().includes(q) || (agent?.keywords || '').toLowerCase().includes(q);

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle={`${counts.live} live · ${counts.paused} paused · ${counts.draft} draft. Open a slot to edit and test it.`}
      />

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input id="agent-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, slot or keyword" className={`${inputClass} pl-9`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CATEGORY_LETTERS.map((letter: CategoryLetter) => {
          const slots = AGENT_SLOTS_TEMPLATE.filter(s => s.code.startsWith(letter));
          const visible = slots.filter(s => matches(s.code, agents.find(a => a.slot_code === s.code)));
          if (q && visible.length === 0) return null;
          return (
            <Card key={letter} className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/50 text-sm font-semibold">{categoryNames[letter]}</div>
              <ul className="divide-y divide-border">
                {visible.map(slot => {
                  const agent = agents.find(a => a.slot_code === slot.code);
                  const status = agent ? agentStatus(agent) : 'empty';
                  return (
                    <li key={slot.code}>
                      <Link href={`/analyst/agents/${slot.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/50 transition">
                        <SlotCode code={slot.code} />
                        <span className={`flex-1 min-w-0 truncate text-sm ${agent ? 'font-medium' : 'text-muted-foreground'}`}>
                          {agent ? agent.name : 'Empty slot · set up an agent'}
                        </span>
                        <StatusChip status={status} />
                        {agent && status !== 'draft' && (
                          <button
                            type="button"
                            onClick={e => togglePause(e, agent)}
                            disabled={busySlot === slot.code}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                            title={status === 'live' ? 'Pause: officers see it locked' : 'Resume'}
                            aria-label={status === 'live' ? `Pause ${slot.code}` : `Resume ${slot.code}`}
                          >
                            {status === 'live' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
