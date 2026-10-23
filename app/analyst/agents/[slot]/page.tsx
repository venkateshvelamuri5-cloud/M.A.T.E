'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowDown, ArrowUp, FlaskConical, History, Plus, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../../../src/supabase-client';
import { requestIngestion } from '../../../../src/services/documents/client';
import { useAnalyst } from '../../_lib/context';
import { Agent, AgentStatus, AGENT_SLOTS_TEMPLATE, CategoryLetter, KnowledgeFile, LLM_PROVIDERS, agentStatus } from '../../_lib/slots';
import { deleteAgent, loadCategoryNames, setAgentStatus, snapshotOf } from '../../_lib/agents';
import { AgentVersion, logChange, saveAgentVersion } from '../../_lib/audit';
import { Button, Card, Chip, Field, SlotCode, StatusChip, ingestChip, inputClass, timeAgo, formatDateTime } from '../../_lib/ui';

interface EditorForm {
  name: string;
  description: string;
  system_prompt: string;
  instructions: string;
  keywords: string;
  custom_questions: string[];
  llm_provider: string;
  bypass_keyword_match: boolean;
}

const FIELD_LABELS: Record<keyof EditorForm, string> = {
  name: 'Name',
  description: 'Description',
  system_prompt: 'Instructions for the AI',
  instructions: 'How to use (shown to officers)',
  keywords: 'Routing keywords',
  custom_questions: 'Form questions',
  llm_provider: 'AI model',
  bypass_keyword_match: 'Read documents in full'
};

type Tab = 'basics' | 'answers' | 'documents' | 'model';
const TABS: { id: Tab; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'answers', label: 'How it answers' },
  { id: 'documents', label: 'Documents' },
  { id: 'model', label: 'Model & access' }
];

function formFromAgent(agent: Agent): EditorForm {
  return {
    name: agent.name || '',
    description: agent.description || '',
    system_prompt: agent.system_prompt || '',
    instructions: agent.instructions || '',
    keywords: agent.keywords || '',
    custom_questions: agent.custom_questions || [],
    llm_provider: agent.llm_provider || 'groq',
    bypass_keyword_match: agent.bypass_keyword_match || false
  };
}

function formFromTemplate(slotCode: string): EditorForm {
  const t = AGENT_SLOTS_TEMPLATE.find(s => s.code === slotCode);
  return {
    name: t?.name || '',
    description: t?.placeholder1 || '',
    system_prompt: t?.systemDirective || '',
    instructions: t?.emailExample || '',
    keywords: '',
    custom_questions: [],
    llm_provider: 'groq',
    bypass_keyword_match: false
  };
}

const sameList = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

export default function AgentEditorPage() {
  const params = useParams<{ slot: string }>();
  const slotCode = (params?.slot || '').toUpperCase();
  const router = useRouter();
  const { toast, confirm, deferred } = useAnalyst();

  const template = AGENT_SLOTS_TEMPLATE.find(s => s.code === slotCode);
  const [loaded, setLoaded] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState<EditorForm>(formFromTemplate(slotCode));
  const [savedForm, setSavedForm] = useState<EditorForm>(formFromTemplate(slotCode));
  const [linked, setLinked] = useState<string[]>([]);
  const [savedLinked, setSavedLinked] = useState<string[]>([]);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [tab, setTab] = useState<Tab>('basics');
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const load = async () => {
    const [{ data: agentRow }, { data: fileRows }, { data: versionRows }, names] = await Promise.all([
      supabase.from('agents').select('*').eq('slot_code', slotCode).maybeSingle(),
      supabase.from('user_files').select('*').or('file_type.eq.knowledge_base,agent_id.not.is.null').order('name'),
      supabase.from('agent_versions').select('*').eq('slot_code', slotCode).order('version', { ascending: false }).limit(50),
      loadCategoryNames()
    ]);
    const a = (agentRow as Agent) || null;
    const allFiles = (fileRows || []) as KnowledgeFile[];
    setAgent(a);
    setFiles(allFiles);
    setVersions((versionRows || []) as AgentVersion[]);
    setCategoryName(names[slotCode.charAt(0) as CategoryLetter] || '');
    const f = a ? formFromAgent(a) : formFromTemplate(slotCode);
    const l = a ? allFiles.filter(x => x.agent_id === a.id).map(x => x.id) : [];
    setForm(f); setSavedForm(f);
    setLinked(l); setSavedLinked(l);
    setLoaded(true);
  };

  useEffect(() => { if (template) load(); }, [slotCode]);

  const changedFields = useMemo(() => (Object.keys(form) as (keyof EditorForm)[])
    .filter(k => JSON.stringify(form[k]) !== JSON.stringify(savedForm[k])), [form, savedForm]);
  const linksChanged = !sameList(linked, savedLinked);
  const dirty = changedFields.length > 0 || linksChanged || !agent;

  // Warn before closing the tab with unsaved edits to an existing agent.
  useEffect(() => {
    if (!agent || (changedFields.length === 0 && !linksChanged)) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [agent, changedFields.length, linksChanged]);

  const set = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => setForm(f => ({ ...f, [key]: value }));

  if (!template) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm">There is no slot called “{params?.slot}”.</p>
        <Link href="/analyst/agents" className="text-sm font-semibold text-[#575ECF]">Back to agents</Link>
      </Card>
    );
  }

  const status: AgentStatus | 'empty' = agent ? agentStatus(agent) : 'empty';

  const handleSave = async (newStatus?: AgentStatus) => {
    if (!form.name.trim() || !form.system_prompt.trim()) {
      toast('Give the agent a name and instructions for the AI before saving.', 'error');
      setTab(!form.name.trim() ? 'basics' : 'answers');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slot_code: slotCode,
        name: form.name.trim(),
        description: form.description,
        system_prompt: form.system_prompt,
        instructions: form.instructions,
        keywords: form.keywords,
        custom_questions: form.custom_questions.filter(q => q.trim() !== ''),
        llm_provider: form.llm_provider,
        bypass_keyword_match: form.bypass_keyword_match,
        updated_at: new Date().toISOString()
      };

      let saved: Agent;
      if (agent) {
        // Keep a copy of the state before the first tracked change, so it can be restored too.
        if (versions.length === 0) await saveAgentVersion(slotCode, agent.id, snapshotOf(agent, savedLinked), 'Before first tracked change');
        const { data, error } = await supabase.from('agents').update(payload).eq('id', agent.id).select().single();
        if (error) throw error;
        saved = data as Agent;
      } else {
        const st = newStatus || 'draft';
        const { data, error } = await supabase.from('agents').insert({ ...payload, status: st, is_locked: st === 'paused' }).select().single();
        if (error) throw error;
        saved = data as Agent;
      }

      if (linksChanged || !agent) {
        await supabase.from('user_files').update({ agent_id: null }).eq('agent_id', saved.id);
        if (linked.length) await supabase.from('user_files').update({ agent_id: saved.id }).in('id', linked);
      }

      const changes = agent
        ? [...changedFields.map(k => FIELD_LABELS[k]), ...(linksChanged ? ['Documents'] : [])]
        : [];
      const note = agent ? `Changed: ${changes.join(', ') || 'nothing'}` : 'Created';
      await saveAgentVersion(slotCode, saved.id, snapshotOf(saved, linked), note);
      await logChange({
        action: agent ? 'agent.update' : 'agent.create',
        entityType: 'agent',
        entityId: slotCode,
        summary: agent ? `Edited ${slotCode} ${saved.name} (${changes.join(', ').toLowerCase()})` : `Created ${slotCode} ${saved.name} as ${saved.status === 'live' ? 'live' : 'a draft'}`,
        details: { changed: changes }
      });
      toast(agent ? 'Changes saved. Officers get them on their next run.' : saved.status === 'live' ? `${slotCode} is live.` : `${slotCode} saved as a draft. Officers can't see it yet.`);
      await load();
    } catch (err) {
      toast(`Couldn't save: ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (next: AgentStatus) => {
    if (!agent) return;
    try {
      await setAgentStatus(agent, next);
      toast(next === 'live' ? `${slotCode} is live.` : next === 'paused' ? `${slotCode} paused. Officers see it locked.` : `${slotCode} moved to drafts. Officers can't see it.`);
      await load();
    } catch (err) {
      toast(`Couldn't change status: ${(err as Error).message}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!agent) return;
    const ok = await confirm({
      title: `Delete ${slotCode} ${agent.name}?`,
      body: <>The slot becomes empty and officers lose access. Its {savedLinked.length} linked document{savedLinked.length === 1 ? '' : 's'} stay in the library and become available to every agent. You can bring the agent back from its history. If you only need it out of the way for a while, <b>Pause</b> it instead.</>,
      confirmLabel: 'Delete agent',
      danger: true
    });
    if (!ok) return;
    setPendingDelete(true);
    const target = agent;
    const targetLinks = savedLinked;
    deferred({
      message: `Deleting ${slotCode} ${target.name}`,
      onUndo: () => setPendingDelete(false),
      commit: async () => {
        await deleteAgent(target, targetLinks);
        toast(`Deleted ${slotCode}. Restore it from History if you need it back.`);
        if (window.location.pathname === `/analyst/agents/${slotCode}`) router.push('/analyst/agents');
      }
    });
  };

  const restoreVersion = (v: AgentVersion) => {
    const s = v.snapshot;
    setForm({
      name: s.name || '',
      description: s.description || '',
      system_prompt: s.system_prompt || '',
      instructions: s.instructions || '',
      keywords: s.keywords || '',
      custom_questions: s.custom_questions || [],
      llm_provider: s.llm_provider || 'groq',
      bypass_keyword_match: !!s.bypass_keyword_match
    });
    const existing = new Set(files.map(f => f.id));
    setLinked((s.linked_file_ids || []).filter(id => existing.has(id)));
    setShowHistory(false);
    toast(`Version ${v.version} loaded. Review it, then save to make it current.`, 'info');
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || !agent) return;
    const { data: { session } } = await supabase.auth.getSession();
    for (const file of Array.from(fileList)) {
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
          agent_id: agent.id
        }).select().single();
        if (error) throw error;
        requestIngestion(data.id).then(load);
        setLinked(l => [...l, data.id]);
        setSavedLinked(l => [...l, data.id]);
        setFiles(fs => [...fs, data as KnowledgeFile]);
        await logChange({ action: 'file.upload', entityType: 'file', entityId: data.id, summary: `Uploaded ${file.name} for ${slotCode}` });
        toast(`Uploaded ${file.name}. Processing it now.`);
      } catch (err) {
        toast(`Couldn't upload ${file.name}: ${(err as Error).message}`, 'error');
      }
    }
  };

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading {slotCode}…</p>;

  return (
    <>
      <div className="space-y-3">
        <Link href="/analyst/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Agents{categoryName && ` / ${categoryName}`}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold font-display tracking-tight truncate">
              <SlotCode code={slotCode} /> {form.name || 'New agent'}
            </h1>
            <StatusChip status={status} />
          </div>
          <div className="flex flex-wrap gap-2">
            {agent && status === 'live' && <Button onClick={() => handleStatus('paused')}>Pause</Button>}
            {agent && status === 'paused' && <Button variant="primary" onClick={() => handleStatus('live')}>Resume</Button>}
            {agent && status === 'draft' && <Button variant="primary" onClick={() => handleStatus('live')} disabled={dirty}
              title={dirty ? 'Save your changes first' : undefined}>Go live</Button>}
            {agent && status !== 'draft' && <Button variant="ghost" onClick={() => handleStatus('draft')}>Move to drafts</Button>}
            <Button onClick={() => setShowHistory(true)}><History className="w-4 h-4" /> History ({versions.length})</Button>
          </div>
        </div>
        {status === 'paused' && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Paused: officers see this agent with a lock and emails skip it. Resume when you're ready.</p>}
        {status === 'draft' && <p className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">Draft: officers can't see this agent and emails won't be routed to it. Test it on the right, then go live.</p>}
        {pendingDelete && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">Deleting in a few seconds. Use Undo in the message at the bottom of the screen to keep it.</p>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        <Card className="min-w-0">
          <div className="flex gap-1 border-b border-border px-3 overflow-x-auto" role="tablist">
            {TABS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition ${tab === t.id ? 'border-[#575ECF] text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t.label}{t.id === 'documents' && ` (${linked.length})`}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-6">
            {tab === 'basics' && (
              <>
                <Field label="Name" htmlFor="agent-name" hint="What officers see on their dashboard.">
                  <input id="agent-name" value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} placeholder={template.name || 'e.g. Risk Assessment'} />
                </Field>
                <Field label="Description" htmlFor="agent-desc" hint="One or two sentences on what this agent handles. When an email matches no keywords, the AI uses this to decide which agent should take it.">
                  <textarea id="agent-desc" value={form.description} onChange={e => set('description', e.target.value)} rows={3} className={inputClass} />
                </Field>
              </>
            )}

            {tab === 'answers' && (
              <>
                <Field label="Instructions for the AI" htmlFor="agent-prompt" hint="How this agent should think, what it must include and how it should format the answer. Officers never see this.">
                  <textarea id="agent-prompt" value={form.system_prompt} onChange={e => set('system_prompt', e.target.value)} rows={10} className={`${inputClass} font-mono text-[13px] leading-relaxed`} />
                </Field>
                <Field label="How to use (shown to officers)" htmlFor="agent-instructions" hint="An example request or email template. Officers see it on the module page, and get it back if they email “send template”.">
                  <textarea id="agent-instructions" value={form.instructions} onChange={e => set('instructions', e.target.value)} rows={3} className={inputClass} />
                </Field>
                <KeywordsField value={form.keywords} onChange={v => set('keywords', v)} />
                <QuestionsField value={form.custom_questions} onChange={v => set('custom_questions', v)} />
              </>
            )}

            {tab === 'documents' && (
              <DocumentsTab
                files={files}
                linked={linked}
                agentId={agent?.id || null}
                onToggle={id => setLinked(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id])}
                onUpload={handleUpload}
              />
            )}

            {tab === 'model' && (
              <>
                <Field label="AI model" hint="Which provider answers questions sent to this agent.">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {LLM_PROVIDERS.map(p => (
                      <label key={p.value} className={`flex items-start gap-2.5 p-3 border rounded-lg cursor-pointer transition ${form.llm_provider === p.value ? 'border-[#575ECF] bg-indigo-50/50' : 'border-border hover:bg-muted/50'}`}>
                        <input type="radio" name="llm-provider" value={p.value} checked={form.llm_provider === p.value} onChange={() => set('llm_provider', p.value)} className="mt-0.5 accent-[#575ECF]" />
                        <span><span className="block text-sm font-semibold">{p.label}</span><span className="block text-xs text-muted-foreground">{p.hint}</span></span>
                      </label>
                    ))}
                  </div>
                </Field>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.bypass_keyword_match} onChange={e => set('bypass_keyword_match', e.target.checked)} className="mt-1 w-4 h-4 accent-[#575ECF]" />
                  <span>
                    <span className="block text-sm font-semibold">Always read linked documents in full</span>
                    <span className="block text-xs text-muted-foreground leading-relaxed">By default the agent only reads the sections that match the question. Turn this on if answers miss things the documents clearly say. It makes runs slower and more expensive.</span>
                  </span>
                </label>
                {agent && (
                  <div className="border border-red-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Delete this agent</div>
                      <div className="text-xs text-muted-foreground">Empties the slot. You can restore it from History.</div>
                    </div>
                    <Button variant="danger" onClick={handleDelete} disabled={pendingDelete}><Trash2 className="w-4 h-4" /> Delete agent</Button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="sticky bottom-0 bg-card border-t border-border rounded-b-xl px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {!agent ? 'Not saved yet' : dirty ? `Unsaved changes: ${[...changedFields.map(k => FIELD_LABELS[k]), ...(linksChanged ? ['Documents'] : [])].join(', ')}`
                : agent.updated_at ? `Saved ${timeAgo(agent.updated_at)}${versions[0]?.created_by_email ? ` by ${versions[0].created_by_email}` : ''}` : 'All changes saved'}
            </span>
            <div className="flex gap-2">
              {agent && dirty && <Button onClick={() => { setForm(savedForm); setLinked(savedLinked); }}>Discard</Button>}
              {agent ? (
                <Button variant="primary" onClick={() => handleSave()} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              ) : (
                <>
                  <Button onClick={() => handleSave('draft')} disabled={saving}>Save as draft</Button>
                  <Button variant="primary" onClick={() => handleSave('live')} disabled={saving}>Save and go live</Button>
                </>
              )}
            </div>
          </div>
        </Card>

        <TryItPanel slotCode={slotCode} agentId={agent?.id || null} form={form} linked={linked} />
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 bg-zinc-900/30 flex justify-end" onClick={() => setShowHistory(false)}>
          <aside className="w-full max-w-md h-full bg-card border-l border-border shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold">History for {slotCode}</h2>
              <button type="button" onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close history"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {versions.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No saved versions yet. A version is kept every time you save.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {versions.map((v, i) => (
                    <li key={v.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">Version {v.version} {i === 0 && agent && <Chip tone="indigo">Current</Chip>}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(v.created_at)} · {v.created_by_email || 'Unknown'}</div>
                        {v.note && <div className="text-xs mt-1">{v.note}</div>}
                      </div>
                      {!(i === 0 && agent) && <Button size="sm" onClick={() => restoreVersion(v)}>Restore</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function KeywordsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState('');
  const words = value.split(',').map(w => w.trim()).filter(Boolean);
  const add = () => {
    const extra = draft.split(',').map(w => w.trim()).filter(w => w && !words.some(x => x.toLowerCase() === w.toLowerCase()));
    if (extra.length) onChange([...words, ...extra].join(', '));
    setDraft('');
  };
  return (
    <Field label="Routing keywords" htmlFor="agent-keyword" hint="If an email mentions any of these, it comes straight to this agent. Small typos still match. Add abbreviations and common misspellings, e.g. RA, risk assesment.">
      <div className="flex flex-wrap gap-1.5 p-2 border border-border rounded-lg bg-card focus-within:border-[#575ECF]">
        {words.map(w => (
          <span key={w} className="inline-flex items-center gap-1 bg-muted rounded-md pl-2 pr-1 py-0.5 text-sm">
            {w}
            <button type="button" onClick={() => onChange(words.filter(x => x !== w).join(', '))} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${w}`}><X className="w-3.5 h-3.5" /></button>
          </span>
        ))}
        <input
          id="agent-keyword"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !draft && words.length) onChange(words.slice(0, -1).join(', ')); }}
          onBlur={add}
          placeholder={words.length ? 'Add another' : 'Type a keyword and press Enter'}
          className="flex-1 min-w-[140px] outline-none text-sm bg-transparent px-1 py-0.5"
        />
      </div>
    </Field>
  );
}

function QuestionsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const update = (i: number, text: string) => onChange(value.map((q, j) => j === i ? text : q));
  const move = (i: number, d: number) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <Field label="Form questions" hint="Extra questions officers answer on this agent's page. Their answers are sent along with every request.">
      <div className="space-y-2">
        {value.length === 0 && <p className="text-sm text-muted-foreground">No questions. Officers just describe their request.</p>}
        {value.map((q, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground font-mono text-right">{i + 1}</span>
            <input aria-label={`Question ${i + 1}`} value={q} onChange={e => update(i, e.target.value)} className={inputClass} placeholder="e.g. Which permits are required?" />
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="p-1.5 text-muted-foreground hover:text-red-600" aria-label="Remove question"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <Button size="sm" onClick={() => onChange([...value, ''])}><Plus className="w-3.5 h-3.5" /> Add question</Button>
      </div>
    </Field>
  );
}

function DocumentsTab({ files, linked, agentId, onToggle, onUpload }: {
  files: KnowledgeFile[]; linked: string[]; agentId: string | null; onToggle: (id: string) => void; onUpload: (f: FileList | null) => void;
}) {
  const [filter, setFilter] = useState('');
  // A document belongs to at most one agent. Documents linked to other agents aren't offered here.
  const available = files.filter(f => !f.agent_id || f.agent_id === agentId || linked.includes(f.id));
  const shown = available.filter(f => f.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const linkedFiles = shown.filter(f => linked.includes(f.id));
  const otherFiles = shown.filter(f => !linked.includes(f.id));
  const globalCount = files.filter(f => !f.agent_id && f.file_type === 'knowledge_base').length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Linked documents are this agent's own references: it checks them first and they're used only by this agent.
        It also searches the {globalCount} shared document{globalCount === 1 ? '' : 's'} that aren't linked to any agent.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter documents" className={inputClass} aria-label="Filter documents" />
        {agentId ? (
          <label className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-card hover:bg-muted text-sm font-semibold cursor-pointer whitespace-nowrap">
            <Upload className="w-4 h-4" /> Upload for this agent
            <input type="file" multiple className="hidden" accept=".pdf,.docx,.doc,.txt,.md,.rtf,.xlsx,.xls,.csv" onChange={e => { onUpload(e.target.files); e.target.value = ''; }} />
          </label>
        ) : (
          <span className="text-xs text-muted-foreground self-center">Save the agent once to upload documents for it.</span>
        )}
      </div>
      {[{ title: 'Linked to this agent', list: linkedFiles }, { title: 'Shared documents you can link', list: otherFiles }].map(group => (
        <div key={group.title} className="space-y-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.title}</h3>
          {group.list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">None.</p>
          ) : (
            <ul className="border border-border rounded-lg divide-y divide-border max-h-72 overflow-y-auto">
              {group.list.map(f => (
                <li key={f.id}>
                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                    <input type="checkbox" checked={linked.includes(f.id)} onChange={() => onToggle(f.id)} className="w-4 h-4 accent-[#575ECF]" />
                    <span className="flex-1 min-w-0 truncate text-sm">{f.name}</span>
                    {ingestChip(f)}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

interface TestResult {
  output?: string;
  error?: string;
  routing?: { method: 'slot_code' | 'keyword' | 'none'; slotCode?: string; name?: string; isThisAgent: boolean };
  documents?: { name: string; sections: string[] }[];
  skipped?: string[];
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  ms?: number;
}

function TryItPanel({ slotCode, agentId, form, linked }: { slotCode: string; agentId: string | null; form: EditorForm; linked: string[] }) {
  const template = AGENT_SLOTS_TEMPLATE.find(s => s.code === slotCode);
  const [query, setQuery] = useState(template?.emailExample || '');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/agent/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ query, slotCode, agentId, linkedFileIds: linked, draft: form })
      });
      const data = await res.json().catch(() => ({ error: `The test didn't complete (status ${res.status}).` }));
      setResult(res.ok ? data : { ...data, error: data.error || `The test didn't complete (status ${res.status}).` });
    } catch (err) {
      setResult({ error: `The test didn't complete: ${(err as Error).message}` });
    } finally {
      setRunning(false);
    }
  };

  const r = result?.routing;
  return (
    <Card className="p-5 space-y-4 xl:sticky xl:top-6">
      <div>
        <h2 className="font-semibold flex items-center gap-2"><FlaskConical className="w-4 h-4 text-[#575ECF]" /> Try it</h2>
        <p className="text-xs text-muted-foreground mt-1">Runs your current edits, saved or not. Test runs aren't logged, use nobody's limit and send no email.</p>
      </div>
      <textarea aria-label="Sample email or question" value={query} onChange={e => setQuery(e.target.value)} rows={4} className={inputClass} placeholder="Paste a sample email or question" />
      <Button variant="primary" onClick={run} disabled={running || !query.trim()} className="w-full">{running ? 'Running…' : 'Run test'}</Button>

      {result && (
        <div className="space-y-3 text-sm">
          {r && (
            <div className={`rounded-lg px-3 py-2 text-xs ${r.isThisAgent ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              {r.method === 'none'
                ? 'By email, no keyword matches. The AI would pick an agent from the descriptions. Add keywords if this should come here.'
                : r.isThisAgent
                  ? `By email, this would come here (matched by ${r.method === 'slot_code' ? 'slot code' : 'keyword'}).`
                  : `By email, this would go to ${r.slotCode} ${r.name} instead (matched by ${r.method === 'slot_code' ? 'slot code' : 'keyword'}).`}
            </div>
          )}
          {result.documents && (
            <div className="text-xs space-y-1">
              <div className="font-semibold">Documents used</div>
              {result.documents.length === 0 ? <div className="text-muted-foreground">None matched this question.</div> : result.documents.map(d => (
                <div key={d.name}><span className="font-medium">{d.name}</span>{d.sections.length > 0 && <span className="text-muted-foreground"> · {d.sections.slice(0, 3).join('; ')}{d.sections.length > 3 ? '…' : ''}</span>}</div>
              ))}
              {result.skipped && result.skipped.length > 0 && (
                <div className="text-amber-700">Not used because they aren't processed yet: {result.skipped.join(', ')}</div>
              )}
            </div>
          )}
          {result.error ? (
            <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2">{result.error}</div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground font-mono">
                {result.provider} · {result.inputTokens?.toLocaleString()} in / {result.outputTokens?.toLocaleString()} out · ~${result.cost?.toFixed(4)} · {((result.ms || 0) / 1000).toFixed(1)}s
              </div>
              <div className="rounded-lg bg-muted p-3 whitespace-pre-wrap text-[13px] leading-relaxed max-h-[28rem] overflow-y-auto">{result.output}</div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
