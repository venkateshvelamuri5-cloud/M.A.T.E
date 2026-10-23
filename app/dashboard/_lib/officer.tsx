'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { supabase } from '../../../src/supabase-client';
import { loadCategoryNames } from '../../analyst/_lib/agents';
import { CategoryLetter, DEFAULT_CATEGORY_NAMES } from '../../analyst/_lib/slots';
import { Button } from '../../analyst/_lib/ui';
import { buildModules, ComingSoon, Module, OfficerAgent } from './modules';

// Everything the officer pages share: who is signed in, their profile and limits, documents,
// history, the modules they can use, plus toasts and confirm dialogs.

export interface Profile {
  id: string;
  email: string;
  role?: string | null;
  subscription_plan?: string | null;
  full_name?: string | null;
  rank?: string | null;
  company_name?: string | null;
  vessel_email?: string | null;
  vessel_email_last_changed?: string | null;
  vessel_name?: string | null;
  vessel_type?: string | null;
  operator_name?: string | null;
  grt?: string | null;
  has_pump_room?: boolean | null;
  pump_system_type?: string | null;
  has_bow_thruster?: boolean | null;
  carries_chemical_cargo?: boolean | null;
  has_egcs?: boolean | null;
  egcs_type?: string | null;
  operates_us_waters?: boolean | null;
  operates_aus_nz_waters?: boolean | null;
  operates_eu_waters?: boolean | null;
  operates_chinese_waters?: boolean | null;
}

export interface OfficerFile {
  id: string;
  name: string;
  file_size_mb: number;
  file_type: string;
  storage_path: string;
  created_at?: string;
  ingest_status?: string | null;
  ingest_error?: string | null;
}

export interface RunLog {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  agent_id?: string | null;
  email_request?: string | null;
  email_response?: string | null;
  error_message?: string | null;
  routing_layer?: string | null;
}

type ToastKind = 'success' | 'error' | 'info';
interface ConfirmOptions { title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean }

interface OfficerContextValue {
  userId: string;
  email: string;
  profile: Profile;
  plan: string;
  runsUsed: number;
  runsMax: number;
  files: OfficerFile[];
  logs: RunLog[];
  agents: OfficerAgent[];
  modules: Module[];
  comingSoon: ComingSoon[];
  categoryNames: Record<CategoryLetter, string>;
  manual: string;
  answers: Record<string, Record<string, string>>;
  refresh: () => Promise<void>;
  reloadFiles: () => Promise<void>;
  setFiles: React.Dispatch<React.SetStateAction<OfficerFile[]>>;
  setRuns: (used: number, max: number) => void;
  setProfile: (p: Profile) => void;
  setAnswers: (a: Record<string, Record<string, string>>) => void;
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  openHelp: (tab?: HelpTab) => void;
  openProfile: () => void;
  helpTab: HelpTab | null;
  closeHelp: () => void;
  profileOpen: boolean;
  closeProfile: () => void;
  startUpgrade: () => Promise<void>;
}

export type HelpTab = 'start' | 'email' | 'how' | 'manual';

const OfficerContext = createContext<OfficerContextValue | null>(null);

export function useOfficer() {
  const ctx = useContext(OfficerContext);
  if (!ctx) throw new Error('useOfficer must be used inside the officer dashboard');
  return ctx;
}

type LoadState = { status: 'loading' } | { status: 'ready'; userId: string; email: string };

export function OfficerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [auth, setAuth] = useState<LoadState>({ status: 'loading' });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [runsUsed, setRunsUsed] = useState(0);
  const [runsMax, setRunsMax] = useState(10);
  const [files, setFiles] = useState<OfficerFile[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [agents, setAgents] = useState<OfficerAgent[]>([]);
  const [categoryNames, setCategoryNames] = useState<Record<CategoryLetter, string>>(DEFAULT_CATEGORY_NAMES);
  const [manual, setManual] = useState('');
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [helpTab, setHelpTab] = useState<HelpTab | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const [toasts, setToasts] = useState<{ id: number; kind: ToastKind; message: string }[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setToasts(ts => [...ts, { id, kind, message }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>(resolve => setConfirmState({ ...opts, resolve })), []);
  const closeConfirm = (ok: boolean) => { confirmState?.resolve(ok); setConfirmState(null); };

  const load = useCallback(async (uid: string, email: string) => {
    let { data: p } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (p?.role === 'disabled') {
      await supabase.auth.signOut();
      router.push('/login?error=disabled');
      return;
    }
    if (!p) {
      const { data: created } = await supabase.from('profiles')
        .insert({ id: uid, email, role: 'user', subscription_plan: 'free' }).select().single();
      p = created;
    }
    setProfile(p || { id: uid, email });

    let { data: limits } = await supabase.from('usage_limits').select('*').eq('user_id', uid).maybeSingle();
    if (!limits && p) {
      const { data: created } = await supabase.from('usage_limits')
        .insert({ user_id: uid, interactions_count: 0, max_interactions: 10 }).select().single();
      limits = created;
    }
    if (limits) { setRunsUsed(limits.interactions_count || 0); setRunsMax(limits.max_interactions || 0); }

    const [{ data: f }, { data: l }, { data: a }, names, { data: m }, { data: s }] = await Promise.all([
      supabase.from('user_files').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('interactions_log')
        .select('id, subject, status, created_at, agent_id, email_request, email_response, error_message, routing_layer')
        .eq('user_id', uid).order('created_at', { ascending: false }).limit(200),
      loadModulesTable(),
      loadCategoryNames(),
      supabase.from('system_settings').select('value').eq('key', 'user_manual').maybeSingle(),
      supabase.from('user_agent_settings').select('*').eq('user_id', uid)
    ]);
    setFiles((f || []) as OfficerFile[]);
    setLogs((l || []) as RunLog[]);
    setAgents((a || []) as OfficerAgent[]);
    setCategoryNames(names);
    setManual(m?.value || '');
    const map: Record<string, Record<string, string>> = {};
    (s || []).forEach((row: any) => { if (row.answers) map[row.agent_id] = row.answers; });
    setAnswers(map);
  }, [router]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { router.push('/login'); return; }
        const email = session.user.email || '';
        await load(session.user.id, email);
        setAuth({ status: 'ready', userId: session.user.id, email });
      } catch {
        router.push('/login');
      }
    })();
  }, [load, router]);

  const refresh = useCallback(async () => {
    if (auth.status === 'ready') await load(auth.userId, auth.email);
  }, [auth, load]);

  const reloadFiles = useCallback(async () => {
    if (auth.status !== 'ready') return;
    const { data } = await supabase.from('user_files').select('*').eq('user_id', auth.userId).order('created_at', { ascending: false });
    if (data) setFiles(data as OfficerFile[]);
  }, [auth]);

  // While a document is being processed, check on it every few seconds.
  const processing = files.some(f => f.ingest_status === 'queued' || f.ingest_status === 'processing');
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(reloadFiles, 5000);
    return () => clearInterval(t);
  }, [processing, reloadFiles]);

  const startUpgrade = useCallback(async () => {
    if (auth.status !== 'ready') return;
    toast('Opening secure checkout…', 'info');
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: auth.email }) });
      const data = await res.json();
      if (!data.url) throw new Error(data.error || 'Checkout is not available right now.');
      window.location.href = data.url;
    } catch (err) {
      toast(`Couldn't open checkout: ${(err as Error).message}`, 'error');
    }
  }, [auth, toast]);

  const { modules, comingSoon } = useMemo(() => buildModules(agents), [agents]);

  if (auth.status === 'loading' || !profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <img src="/logo.jpeg" alt="" width={44} height={44} className="rounded-lg opacity-80" />
        Loading your workspace…
      </div>
    );
  }

  const value: OfficerContextValue = {
    userId: auth.userId, email: auth.email, profile, plan: profile.subscription_plan || 'free',
    runsUsed, runsMax, files, logs, agents, modules, comingSoon, categoryNames, manual, answers,
    refresh, reloadFiles, setFiles, setRuns: (used, max) => { setRunsUsed(used); setRunsMax(max); }, setProfile, setAnswers, toast, confirm,
    openHelp: (tab = 'start') => setHelpTab(tab), helpTab, closeHelp: () => setHelpTab(null),
    openProfile: () => setProfileOpen(true), profileOpen, closeProfile: () => setProfileOpen(false),
    startUpgrade
  };

  return (
    <OfficerContext.Provider value={value}>
      {children}

      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[80] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg sm:max-w-md ${t.kind === 'error' ? 'bg-red-700 text-white' : 'bg-zinc-900 text-white'}`}>
            {t.kind === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : null}
            <span className="flex-1 min-w-0">{t.message}</span>
            <button type="button" onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))} className="text-zinc-400 hover:text-white shrink-0" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[90] bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => closeConfirm(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground">{confirmState.title}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed">{confirmState.body}</div>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => closeConfirm(false)} autoFocus>Cancel</Button>
              <Button variant={confirmState.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)}>{confirmState.confirmLabel}</Button>
            </div>
          </div>
        </div>
      )}
    </OfficerContext.Provider>
  );
}

const MODULE_COLUMNS = 'id, name, description, slot_code, instructions, custom_questions, keywords, is_locked, status';

/** Officers read agents through a view without the AI instructions. Before that view exists, read the table. */
async function loadModulesTable() {
  const view = await supabase.from('officer_modules').select(MODULE_COLUMNS);
  if (!view.error) return view;
  return supabase.from('agents').select(MODULE_COLUMNS);
}

/** Which profile details are filled in. Answers are tailored using these. */
export function profileCompleteness(p: Profile) {
  const checks: [string, boolean][] = [
    ['your name', !!p.full_name],
    ['rank', !!p.rank],
    ['company', !!p.company_name],
    ['interaction email', !!p.vessel_email],
    ['vessel name', !!p.vessel_name],
    ['vessel type', !!p.vessel_type],
    ['operator', !!p.operator_name],
    ['GRT', !!p.grt],
    ['trading areas', !!(p.operates_us_waters || p.operates_aus_nz_waters || p.operates_eu_waters || p.operates_chinese_waters)]
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}
