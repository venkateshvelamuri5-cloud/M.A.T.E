'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, Copy, FileDown, FileText, Lock, Mail, PencilLine, ThumbsDown, ThumbsUp, Upload } from 'lucide-react';
import { supabase } from '../../../../src/supabase-client';
import { useOfficer } from '../../_lib/officer';
import { MATE_EMAIL, Module, safeFileName, storageLimitMb } from '../../_lib/modules';
import { uploadOfficerFile, UPLOAD_ACCEPT, usedMb } from '../../_lib/files';
import { downloadBlob, Markdown, markdownToDocx } from '../../_lib/markdown';
import { AGENT_SLOTS_TEMPLATE } from '../../../analyst/_lib/slots';
import { Button, Card, Chip, Field, Meter, SlotCode, Toggle, fileStatusChip, formatMb, inputClass } from '../../_lib/ui';

const CACHED_PREFIX = '[CACHED RESPONSE - Last 24 Hours]';

interface Result {
  text: string;
  logId: string | null;
  documentsUsed: string[];
  emailedTo: string | null;
  cached: boolean;
  seconds: number;
}

export default function ModulePage({ params }: { params: { slot_code: string } }) {
  const code = decodeURIComponent(params.slot_code).toUpperCase();
  const { modules } = useOfficer();
  const mod = modules.find(m => m.code === code);

  if (!mod) {
    const planned = AGENT_SLOTS_TEMPLATE.find(s => s.code === code && s.name);
    return (
      <Unavailable
        title={planned ? `${code} ${planned.name} is coming soon` : `There's no module called ${code}`}
        body={planned ? 'The M.A.T.E team is still setting this module up. It will appear on your dashboard when it is ready.' : 'The link may be old or mistyped. Pick a module from your dashboard.'}
      />
    );
  }
  if (mod.paused) {
    return (
      <Unavailable
        icon
        title={`${mod.code} ${mod.name} is paused for updates`}
        body="The M.A.T.E team is updating this module. It will be back shortly. Your history and documents are unaffected."
      />
    );
  }
  return <RunModule module={mod} />;
}

function Unavailable({ title, body, icon = false }: { title: string; body: string; icon?: boolean }) {
  return (
    <Card className="max-w-lg mx-auto mt-6 p-8 text-center space-y-3">
      {icon && <Lock className="w-8 h-8 mx-auto text-amber-500" />}
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#575ECF] hover:underline pt-2"><ArrowLeft className="w-4 h-4" /> Back to all modules</Link>
    </Card>
  );
}

function RunModule({ module: m }: { module: Module }) {
  const router = useRouter();
  const { files, setFiles, userId, plan, profile, email, runsUsed, runsMax, setRuns, refresh, toast, startUpgrade, openProfile } = useOfficer();
  const [requirement, setRequirement] = useState('');
  const [mustInclude, setMustInclude] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [emailMe, setEmailMe] = useState(false);
  const [wordWhenReady, setWordWhenReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ message: string; limit?: boolean } | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const requirementRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const atLimit = runsMax > 0 && runsUsed >= runsMax;
  const sendTo = profile.vessel_email || email;

  // "Run again" from history arrives with the earlier request filled in.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('q')) setRequirement(p.get('q')!);
    if (p.get('inc')) setMustInclude(p.get('inc')!);
  }, []);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const toggleFile = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    let current = files;
    for (const file of Array.from(list)) {
      setUploading(n => n + 1);
      try {
        const row = await uploadOfficerFile(file, userId, plan, current);
        current = [row, ...current];
        setFiles(current);
        setSelected(s => [...s, row.id]);
        toast(`Added ${file.name} and selected it for this request.`);
      } catch (err) {
        toast((err as Error).message, 'error');
      } finally {
        setUploading(n => n - 1);
      }
    }
  };

  const downloadWord = async (text: string) => {
    try {
      downloadBlob(await markdownToDocx(`${m.code} ${m.name}`, text), `${m.code}_${safeFileName(m.name)}.docx`);
    } catch (err) {
      toast(`Couldn't make the Word file: ${(err as Error).message}`, 'error');
    }
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (running) return;
    if (!requirement.trim()) {
      toast('Describe what you need first.', 'error');
      requirementRef.current?.focus();
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ agentId: m.agentId, requirement: requirement.trim(), mustInclude: mustInclude.trim(), selectedFileIds: selected, sendEmail: emailMe })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { toast('Your session has expired. Sign in again.', 'error'); router.push('/login'); return; }
      if (!res.ok) { setError({ message: data.error || 'The module couldn\'t finish. Please try again.', limit: !!data.limitReached }); return; }

      const raw: string = data.result || '';
      const cached = raw.startsWith(CACHED_PREFIX);
      const text = cached ? raw.slice(CACHED_PREFIX.length).trimStart() : raw;
      setResult({ text, logId: data.logId || null, documentsUsed: data.documentsUsed || [], emailedTo: data.emailedTo || null, cached, seconds: Math.round((Date.now() - started) / 1000) });
      if (typeof data.runsUsed === 'number') setRuns(data.runsUsed, data.runsMax);
      if (wordWhenReady) downloadWord(text);
      if (window.innerWidth < 1024) setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      refresh();
    } catch {
      setError({ message: 'Couldn\'t reach M.A.T.E. Check your connection and try again.' });
    } finally {
      setRunning(false);
    }
  };

  const limit = storageLimitMb(plan);
  const used = usedMb(files);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> All modules</Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2.5"><SlotCode code={m.code} /> <span className="min-w-0">{m.name}</span></h1>
          {m.description && <p className="text-sm text-muted-foreground max-w-2xl">{m.description}</p>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start">
        <form onSubmit={submit} className="space-y-5 min-w-0">
          <Card className="p-5 space-y-5">
            <Field label="What do you need?" htmlFor="run-requirement" hint="The more detail, the better the answer: the situation, the equipment, the port or terminal, and who asked for it.">
              <textarea
                ref={requirementRef}
                id="run-requirement"
                rows={5}
                value={requirement}
                onChange={e => setRequirement(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
                placeholder={m.examples[0] ? `e.g. ${m.examples[0]}` : 'Describe the task or question'}
                className={`${inputClass} leading-relaxed`}
              />
            </Field>
            {m.examples.length > 0 && !requirement && (
              <div className="flex flex-wrap gap-2 -mt-2">
                {m.examples.map(ex => (
                  <button key={ex} type="button" onClick={() => { setRequirement(ex); requirementRef.current?.focus(); }}
                    className="text-xs px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:border-[#575ECF] hover:text-[#575ECF] text-left max-w-full truncate" title={ex}>
                    Try: {ex}
                  </button>
                ))}
              </div>
            )}
            <Field label="Must include (optional)" htmlFor="run-include" hint="Points the answer has to cover, one per line.">
              <textarea id="run-include" rows={2} value={mustInclude} onChange={e => setMustInclude(e.target.value)} placeholder={`e.g. ${m.mustIncludeHint}`} className={inputClass} />
            </Field>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Documents</h2>
              <span className="text-xs text-muted-foreground">{selected.length ? `${selected.length} selected` : 'Optional'}</span>
            </div>
            {files.length > 0 && (
              <ul className="max-h-48 overflow-y-auto -mx-1 space-y-0.5">
                {files.map(f => (
                  <li key={f.id}>
                    <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer text-sm">
                      <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggleFile(f.id)} className="w-4 h-4 accent-[#575ECF] shrink-0" />
                      <span className="truncate flex-1" title={f.name}>{f.name}</span>
                      {fileStatusChip(f)}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
              onClick={() => fileInput.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}
              role="button"
              tabIndex={0}
              className={`rounded-lg border-2 border-dashed px-3 py-3 flex items-center justify-center gap-2 text-sm cursor-pointer transition ${dragging ? 'border-[#575ECF] bg-indigo-50/60' : 'border-border text-muted-foreground hover:border-[#575ECF]/60'}`}
            >
              <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Drop a file or click to add one'}
              <input ref={fileInput} type="file" multiple accept={UPLOAD_ACCEPT} className="hidden" onChange={e => { upload(e.target.files); e.target.value = ''; }} />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Meter used={used} max={limit} className="w-24" />
              <span className="tabular-nums">{formatMb(used)} of {limit >= 1000 ? `${limit / 1000} GB` : `${limit} MB`}</span>
            </div>
            <p className="text-xs text-muted-foreground">Company documents and this module&apos;s own documents are always included.</p>
          </Card>

          <Card className="p-5 space-y-3">
            <Toggle id="run-email" checked={emailMe} onChange={setEmailMe}>
              Email the answer to <b className="font-semibold">{sendTo}</b>
            </Toggle>
            <Toggle id="run-word" checked={wordWhenReady} onChange={setWordWhenReady}>Download as Word when it&apos;s ready</Toggle>
          </Card>

          {atLimit ? (
            <Card className="p-4 border-red-200 bg-red-50/60 text-sm space-y-2">
              <div className="font-semibold">You&apos;ve used all {runsMax} runs.</div>
              {plan !== 'premium' ? <Button variant="primary" onClick={startUpgrade}>Upgrade to keep going</Button> : <p className="text-muted-foreground">Contact the M.A.T.E team to raise your limit.</p>}
            </Card>
          ) : (
            <div className="space-y-2">
              <Button type="submit" variant="primary" disabled={running} className="w-full py-3 text-[15px]">
                {running ? `Working… ${elapsed} s` : `Generate ${m.name.toLowerCase().startsWith('general') ? 'answer' : m.name}`}
              </Button>
              <p className="text-xs text-center text-muted-foreground">Uses 1 of your {runsMax - runsUsed} remaining runs · Ctrl + Enter</p>
            </div>
          )}

          <EmailHowTo module={m} />
        </form>

        <div ref={answerRef} className="lg:sticky lg:top-20 min-w-0">
          <Card className="min-h-[420px] flex flex-col">
            {running ? (
              <Waiting seconds={elapsed} documents={selected.length} />
            ) : error ? (
              <div className="p-6 space-y-3">
                <h2 className="font-semibold text-red-700">{error.limit ? 'Run limit reached' : 'That didn\'t work'}</h2>
                <p className="text-sm text-muted-foreground">{error.message}</p>
                {error.limit && plan !== 'premium' && <Button variant="primary" onClick={startUpgrade}>Upgrade</Button>}
              </div>
            ) : result ? (
              <Answer module={m} result={result} onWord={() => downloadWord(result.text)} onEdit={() => requirementRef.current?.focus()} />
            ) : (
              <EmptyAnswer module={m} onProfile={openProfile} profileShort={!profile.vessel_type || !profile.vessel_name} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Waiting({ seconds, documents }: { seconds: number; documents: number }) {
  const stage = seconds < 4 ? 'Reading your request and vessel profile' : seconds < 12 ? (documents ? 'Searching your documents and the company manuals' : 'Searching the company manuals') : 'Writing the answer';
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-10 h-10 rounded-full border-2 border-[#575ECF]/20 border-t-[#575ECF] animate-spin motion-reduce:animate-none" />
      <div>
        <div className="font-semibold text-sm">{stage}…</div>
        <div className="text-xs text-muted-foreground mt-1 tabular-nums">{seconds} s{seconds > 25 ? ' · long documents take a little longer' : ''}</div>
      </div>
    </div>
  );
}

function EmptyAnswer({ module: m, onProfile, profileShort }: { module: Module; onProfile: () => void; profileShort: boolean }) {
  return (
    <div className="flex-1 p-6 sm:p-8 space-y-5">
      <div className="space-y-1">
        <h2 className="font-semibold">Your {m.name.toLowerCase()} will appear here</h2>
        <p className="text-sm text-muted-foreground">Formatted with headings and tables, ready to copy into your forms or download as Word.</p>
      </div>
      <ul className="space-y-3 text-sm">
        <li className="flex gap-3"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /><span><b>Be specific.</b> <span className="text-muted-foreground">&ldquo;Midship crane inoperative; terminal needs it before berthing for loading&rdquo; beats &ldquo;crane not working&rdquo;.</span></span></li>
        <li className="flex gap-3"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /><span><b>Add the office email</b> <span className="text-muted-foreground">or manual extract that asks for this, so the answer covers their points.</span></span></li>
        <li className="flex gap-3"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /><span><b>Check before you use it.</b> <span className="text-muted-foreground">M.A.T.E drafts; you stay responsible for the final document.</span></span></li>
      </ul>
      {profileShort && (
        <p className="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">
          Your vessel details are incomplete, so answers will be more generic. <button type="button" onClick={onProfile} className="font-semibold underline">Add them</button>
        </p>
      )}
    </div>
  );
}

function Answer({ module: m, result, onWord, onEdit }: { module: Module; result: Result; onWord: () => void; onEdit: () => void }) {
  const { toast } = useOfficer();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast('Copy isn\'t available here. Select the text instead.', 'error');
    }
  };
  const text = () => {
    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${m.code}_${safeFileName(m.name)}.txt`);
  };

  return (
    <div className="flex flex-col">
      <div className="px-5 sm:px-6 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <Chip tone="green"><Check className="w-3 h-3" /> {result.cached ? 'Same request as earlier today' : `Done in ${result.seconds} s`}</Chip>
        {result.cached && <span className="text-xs text-muted-foreground">Earlier answer reused, no run used</span>}
        {result.emailedTo && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Sent to {result.emailedTo}</span>}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" onClick={copy}>{copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}</Button>
          <Button size="sm" onClick={onWord}><FileDown className="w-3.5 h-3.5" /> Word</Button>
          <Button size="sm" onClick={text}><FileText className="w-3.5 h-3.5" /> Text</Button>
        </div>
      </div>
      {result.documentsUsed.length > 0 && (
        <div className="px-5 sm:px-6 pt-3 text-xs text-muted-foreground">Based on: {result.documentsUsed.join(', ')}</div>
      )}
      <div className="px-5 sm:px-6 py-5 max-h-[70vh] overflow-y-auto"><Markdown text={result.text} /></div>
      <div className="px-5 sm:px-6 py-3 border-t border-border flex flex-wrap items-center gap-3">
        <Rate module={m} logId={result.logId} />
        <button type="button" onClick={onEdit} className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><PencilLine className="w-3.5 h-3.5" /> Edit request</button>
      </div>
    </div>
  );
}

/** Thumbs up or down on this answer, with an optional note. Saved against the run for the analysts. */
function Rate({ module: m, logId }: { module: Module; logId: string | null }) {
  const { toast } = useOfficer();
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const send = async (r: 'up' | 'down' | null, withNote: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ rating: r, feedback: withNote, agentCode: m.code, agentName: m.name, agentId: m.agentId, logId })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Feedback could not be sent.');
      return true;
    } catch (err) {
      toast((err as Error).message, 'error');
      return false;
    }
  };

  const pick = async (r: 'up' | 'down') => {
    if (sent) return;
    setRating(r);
    if (r === 'down') { setNoteOpen(true); return; }
    if (await send('up', '')) { setSent(true); toast('Thanks. Glad it helped.'); }
  };

  const sendNote = async () => {
    if (await send(rating, note.trim())) { setSent(true); setNoteOpen(false); toast('Thanks. The M.A.T.E team will look at it.'); }
  };

  return (
    <div className="flex flex-col gap-2 w-full sm:w-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {sent ? 'Thanks for the feedback.' : 'Was this useful?'}
        <button type="button" disabled={sent} onClick={() => pick('up')} aria-pressed={rating === 'up'} aria-label="Useful"
          className={`p-1.5 rounded-lg border ${rating === 'up' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-border hover:bg-muted'} disabled:cursor-default`}><ThumbsUp className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={sent} onClick={() => pick('down')} aria-pressed={rating === 'down'} aria-label="Not useful"
          className={`p-1.5 rounded-lg border ${rating === 'down' ? 'border-red-300 bg-red-50 text-red-700' : 'border-border hover:bg-muted'} disabled:cursor-default`}><ThumbsDown className="w-3.5 h-3.5" /></button>
      </div>
      {noteOpen && !sent && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input id="rate-note" value={note} onChange={e => setNote(e.target.value)} placeholder="What was wrong or missing? (optional)" className={`${inputClass} sm:w-72`} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendNote(); } }} />
          <Button size="sm" variant="primary" onClick={sendNote}>Send</Button>
        </div>
      )}
    </div>
  );
}

/** How to ask this module by email, with a per-module instruction sheet to keep on board. */
function EmailHowTo({ module: m }: { module: Module }) {
  const { profile, email, manual } = useOfficer();
  const [open, setOpen] = useState(false);
  const from = profile.vessel_email || email;
  const keywords = m.keywords.slice(0, 6);

  const download = () => {
    const lines = [
      `M.A.T.E: how to ask ${m.code} ${m.name} by email`,
      '',
      `TO:       ${MATE_EMAIL}`,
      `FROM:     ${from} (your registered address)`,
      `SUBJECT:  ${m.code}${keywords.length ? `  (or one of: ${keywords.join(', ')})` : ''}`,
      'BODY:     One line saying what you need.',
      '          Then a blank line, and any points the answer must include.',
      'ATTACH:   Any PDF that helps, e.g. the office email asking for it.',
      '',
      'The more detail you give, the better the answer.',
      m.emailExample ? `\nEXAMPLE\nSUBJECT: ${m.code}\nBODY:    ${m.emailExample}` : '',
      manual.trim() ? `\n\n==== USER MANUAL ====\n\n${manual.trim()}` : ''
    ];
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), `${m.code}_email_instructions.txt`);
  };

  return (
    <Card>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full px-5 py-3.5 flex items-center gap-2 text-sm font-semibold">
        <Mail className="w-4 h-4 text-muted-foreground" /> Ask {m.code} by email instead
        <ChevronDown className={`w-4 h-4 ml-auto text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 text-sm">
          <div className="rounded-lg bg-muted/50 p-3 font-mono text-[12.5px] space-y-1 break-words">
            <div><span className="text-muted-foreground">To:</span> {MATE_EMAIL}</div>
            <div><span className="text-muted-foreground">Subject:</span> {m.code}{keywords.length ? <span className="text-muted-foreground"> or {keywords.slice(0, 3).join(', ')}</span> : null}</div>
            {m.emailExample && <div><span className="text-muted-foreground">Body:</span> {m.emailExample}</div>}
          </div>
          <p className="text-muted-foreground">Send it from {from}. The answer comes back by email and uses one run.</p>
          <Button size="sm" onClick={download}><FileDown className="w-3.5 h-3.5" /> Download these instructions</Button>
        </div>
      )}
    </Card>
  );
}
