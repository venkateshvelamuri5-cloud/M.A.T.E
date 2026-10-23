'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Lock, LayoutDashboard, Bot, Library, Users, Activity, Settings, History, LogOut } from 'lucide-react';
import { supabase } from '../../src/supabase-client';
import { AnalystProvider } from './_lib/context';
import { agentStatus } from './_lib/slots';

const NAV = [
  { href: '/analyst', label: 'Overview', icon: LayoutDashboard },
  { href: '/analyst/agents', label: 'Agents', icon: Bot },
  { href: '/analyst/knowledge', label: 'Knowledge', icon: Library },
  { href: '/analyst/people', label: 'People & limits', icon: Users },
  { href: '/analyst/activity', label: 'Activity', icon: Activity },
  { href: '/analyst/changes', label: 'Change log', icon: History },
  { href: '/analyst/settings', label: 'Settings', icon: Settings }
];

type AuthState = { status: 'checking' } | { status: 'signed-out'; error?: string } | { status: 'analyst'; userId: string; email: string };

export default function AnalystLayout({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' });

  const admit = async (user: { id: string; email?: string }) => {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role === 'analyst') {
      setAuth({ status: 'analyst', userId: user.id, email: user.email || '' });
    } else {
      await supabase.auth.signOut();
      setAuth({ status: 'signed-out', error: 'This account is not an analyst account. Sign in with an analyst email.' });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) await admit(session.user);
        else setAuth({ status: 'signed-out' });
      } catch {
        setAuth({ status: 'signed-out' });
      }
    })();
  }, []);

  if (auth.status === 'checking') {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading console…</div>;
  }
  if (auth.status === 'signed-out') {
    return <SignIn initialError={auth.error} onSignedIn={admit} />;
  }

  return (
    <AnalystProvider userId={auth.userId} userEmail={auth.email}>
      <Shell email={auth.email}>{children}</Shell>
    </AnalystProvider>
  );
}

function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname() || '/analyst';
  const [counts, setCounts] = useState<{ live: number; failedDocs: number } | null>(null);

  // Menu badges refresh on every navigation so they stay roughly current without polling.
  useEffect(() => {
    (async () => {
      const [{ data: agents }, { count: failedDocs }] = await Promise.all([
        supabase.from('agents').select('id, status, is_locked'),
        supabase.from('user_files').select('id', { count: 'exact', head: true })
          .or('file_type.eq.knowledge_base,agent_id.not.is.null').eq('ingest_status', 'failed')
      ]);
      setCounts({
        live: (agents || []).filter(a => agentStatus(a as any) === 'live').length,
        failedDocs: failedDocs || 0
      });
    })();
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const isActive = (href: string) => href === '/analyst' ? pathname === '/analyst' : pathname.startsWith(href);
  const badge = (href: string) => {
    if (!counts) return null;
    if (href === '/analyst/agents') return <span className="text-xs font-mono text-muted-foreground">{counts.live} live</span>;
    if (href === '/analyst/knowledge' && counts.failedDocs > 0) return <span className="text-xs font-mono text-red-600">{counts.failedDocs} failed</span>;
    return null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="border-b lg:border-b-0 lg:border-r border-border bg-card lg:sticky lg:top-0 lg:h-screen flex flex-col">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between lg:block">
          <Link href="/analyst" className="block">
            <span className="font-display font-bold text-lg tracking-wide text-foreground">M.A.T.E</span>
            <span className="block text-xs text-muted-foreground">Analyst console</span>
          </Link>
          <button type="button" onClick={handleSignOut} className="lg:hidden text-xs font-semibold text-muted-foreground hover:text-foreground">Sign out</button>
        </div>
        <nav className="flex lg:flex-col gap-1 px-3 pb-3 overflow-x-auto lg:overflow-visible" aria-label="Analyst console">
          {NAV.map(item => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
                  active ? 'bg-indigo-50 text-[#575ECF] font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground font-medium'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="hidden lg:inline">{badge(item.href)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden lg:block mt-auto px-5 py-4 border-t border-border space-y-2">
          <div className="text-xs text-muted-foreground truncate" title={email}>{email}</div>
          <div className="flex gap-4">
            <Link href="/" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Home</Link>
            <button type="button" onClick={handleSignOut} className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 sm:px-8 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto space-y-6">{children}</div>
      </main>
    </div>
  );
}

function SignIn({ initialError, onSignedIn }: { initialError?: string; onSignedIn: (user: { id: string; email?: string }) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError || null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;
      if (data.user) await onSignedIn(data.user);
    } catch (err) {
      setError((err as any)?.message || 'Sign in failed. Check the email and password and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6">
      <div className="w-full max-w-sm bg-card border border-border p-8 rounded-xl shadow-sm relative">
        <Link href="/" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-xs font-semibold flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Home
        </Link>
        <div className="w-9 h-9 rounded-lg bg-[#575ECF] flex items-center justify-center mb-6">
          <Lock className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-lg font-bold mb-1">Analyst sign in</h1>
        <p className="text-muted-foreground text-sm mb-6">Manage agents, documents, users and limits.</p>
        {error && <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-red-700 text-sm mb-4">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="analyst-email" className="block text-sm font-semibold">Email</label>
            <input id="analyst-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="mate@logmark-ai.com"
              className="w-full px-3 py-2 border border-border focus:border-[#575ECF] bg-background rounded-lg text-sm outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="analyst-password" className="block text-sm font-semibold">Password</label>
            <input id="analyst-password" type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border focus:border-[#575ECF] bg-background rounded-lg text-sm outline-none" />
          </div>
          <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg bg-[#575ECF] hover:bg-[#464cb3] text-white font-semibold text-sm transition disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
