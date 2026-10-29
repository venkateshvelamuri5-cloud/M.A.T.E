"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/supabase-client';
import { ArrowLeft, UserPlus } from 'lucide-react';
import '../aurora.css';
import { useAurora } from '../../components/aurora/useAurora';

export default function SignupPage() {
  const router = useRouter();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [rankInput, setRankInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [vesselEmailInput, setVesselEmailInput] = useState('');

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const { canvasRef, stageRef, handleRef, noWebGL, ready } = useAurora('register');

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, []);

  // Each detail the officer fills in pulls more of the agent's swarm into their document.
  const details = [
    { label: 'Name', done: fullNameInput.trim().length > 1 },
    { label: 'Rank', done: rankInput.trim().length > 1 },
    { label: 'Company', done: companyInput.trim().length > 1 },
    { label: 'Ship email', done: /\S+@\S+\.\S+/.test(vesselEmailInput) },
    { label: 'Login email', done: emailInput.toLowerCase().endsWith('@gmail.com') },
    { label: 'Password', done: passwordInput.length >= 6 },
  ];
  const filled = details.filter((d) => d.done).length;
  const morph = registered ? 1 : filled / details.length * 0.85;
  useEffect(() => { handleRef.current?.setMorph(morph); }, [morph, ready, handleRef]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsLoading(true);

    if (!emailInput.toLowerCase().endsWith('@gmail.com')) {
      setStatusMsg("Registration failed: Only Gmail accounts (@gmail.com) are permitted to register.");
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailInput,
        password: passwordInput,
        options: {
          data: {
            full_name: fullNameInput,
            rank: rankInput,
            company_name: companyInput,
            vessel_email: vesselEmailInput
          }
        }
      });
      if (error) throw error;
      if (data.user) {
        setRegistered(true);
        setStatusMsg("Account successfully registered! Initializing mariner space...");

        // Fire welcome email — non-blocking
        fetch('/api/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailInput,
            fullName: fullNameInput
          })
        }).catch(err => console.warn('Welcome email failed (non-critical):', err));

        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      }
    } catch (err) {
      console.error("Auth error occurred:", err);
      const errMsg = err && typeof err === 'object'
        ? (err as any).message || (err as any).error_description || JSON.stringify(err)
        : String(err);
      setStatusMsg(`Registration failed: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isError = statusMsg && (statusMsg.includes('failed') || statusMsg.includes('error'));
  const badEmail = emailInput.includes('@') && !emailInput.toLowerCase().endsWith('@gmail.com');

  return (
    <div className="aurora au-auth">
      <div className={`au-stage au-auth-stage${noWebGL ? ' no-webgl' : ''}`} ref={stageRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="au-edge" aria-hidden="true" />
      </div>

      <header className="au-top">
        <div className="au-wrap">
          <Link href="/" className="au-brand" aria-label="M.A.T.E home">
            <img src="/logo.jpeg" alt="" width="34" height="34" />
            <b>M.A.T.E</b>
          </Link>
          <Link href="/" className="au-btn au-btn-glass au-btn-sm"><ArrowLeft className="h-4 w-4" /> Home</Link>
        </div>
      </header>

      <aside className="au-signon" aria-live="polite">
        <div className="au-eyebrow">Your agent is taking shape</div>
        <div className="caption">{registered ? 'Signed on. Welcome aboard.' : `${filled} of ${details.length} details logged`}</div>
        <div className="meter"><i style={{ width: `${(registered ? 1 : filled / details.length) * 100}%` }} /></div>
        <div className="au-chip-row">
          {details.map((d) => <span key={d.label} className={`au-chip${d.done ? ' on' : ''}`}>{d.done ? '✓ ' : ''}{d.label}</span>)}
        </div>
      </aside>

      <main className="au-auth-main au-register-main">
        <div className="au-panel">
          <div className="au-no">Sign on · Register</div>
          <h1>Sign on <em>to M.A.T.E.</em></h1>
          <p className="au-body">Set up your officer profile and the ship email you&apos;ll write from. Vessel particulars can be added in settings later.</p>

          {statusMsg && <div className={`au-status ${isError ? 'err' : 'ok'}`} role="status">{statusMsg}</div>}

          <button
            type="button"
            onClick={async () => {
              try {
                await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: { redirectTo: `${window.location.origin}/dashboard` }
                });
              } catch (err) {}
            }}
            className="au-btn au-btn-block au-google"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <div className="au-or">OR</div>

          <form onSubmit={handleSignup} className="au-form">
            <fieldset className="au-fieldset">
              <legend className="au-legend">01 · Officer</legend>
              <div className="au-grid2">
                <div className="au-field">
                  <label htmlFor="full-name">Full name</label>
                  <input id="full-name" type="text" required autoComplete="name" value={fullNameInput} onChange={e => setFullNameInput(e.target.value)} placeholder="Capt. John Doe" />
                </div>
                <div className="au-field">
                  <label htmlFor="rank">Rank</label>
                  <input id="rank" type="text" required value={rankInput} onChange={e => setRankInput(e.target.value)} placeholder="Chief Mate" />
                </div>
              </div>
            </fieldset>

            <fieldset className="au-fieldset">
              <legend className="au-legend">02 · Ship contact</legend>
              <div className="au-grid2">
                <div className="au-field">
                  <label htmlFor="company">Company</label>
                  <input id="company" type="text" required autoComplete="organization" value={companyInput} onChange={e => setCompanyInput(e.target.value)} placeholder="Merchant Shipping Ltd" />
                </div>
                <div className="au-field">
                  <label htmlFor="vessel-email">Ship email you&apos;ll write from</label>
                  <input id="vessel-email" type="email" required value={vesselEmailInput} onChange={e => setVesselEmailInput(e.target.value)} placeholder="pioneer@vessel-net.com" />
                </div>
              </div>
            </fieldset>

            <fieldset className="au-fieldset">
              <legend className="au-legend">03 · Account</legend>
              <div className="au-field">
                <label htmlFor="login-email">Login email (Gmail)</label>
                <input id="login-email" type="email" required autoComplete="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="john.doe@gmail.com" />
                {badEmail ? <span className="bad">Only Gmail accounts (@gmail.com) are permitted.</span> : <span className="hint">Use a personal Gmail address.</span>}
              </div>
              <div className="au-field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" required autoComplete="new-password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="••••••••" />
              </div>
            </fieldset>

            <button type="submit" disabled={isLoading} className="au-btn au-btn-gold au-btn-block">
              {isLoading ? 'Registering…' : <>Register mariner space <UserPlus className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="au-switch">Already registered? <Link href="/login">Sign in</Link></p>
        </div>
      </main>
    </div>
  );
}
