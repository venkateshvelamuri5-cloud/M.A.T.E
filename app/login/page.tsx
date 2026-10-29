"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/supabase-client';
import { ArrowLeft } from 'lucide-react';
import '../aurora.css';
import { useAurora, useBridgeClock } from '../../components/aurora/useAurora';

export default function LoginPage() {
  const router = useRouter();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { canvasRef, stageRef, linkRef, headingRef, handleRef, noWebGL } = useAurora('login');
  const { utcRef, posRef } = useBridgeClock();

  useEffect(() => {
    // Check if URL has ?error=disabled
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'disabled') {
      setStatusMsg("Auth failed: Your account has been disabled. Please contact support at hello@logmark-ai.com.");
    }

    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Only redirect if not explicitly redirected with error
        if (params.get('error') !== 'disabled') {
          router.push('/dashboard');
        }
      }
    };
    checkUser();
  }, []);

  const handleGoogleLogin = async () => {
    setStatusMsg(null);
    setIsLoading(true);
    handleRef.current?.uplink();

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error("Google Auth error occurred:", err);
      const errMsg = err && typeof err === 'object'
        ? (err as any).message || (err as any).error_description || JSON.stringify(err)
        : String(err);
      setStatusMsg(`Google sign-in failed: ${errMsg}`);
      setIsLoading(false);
    }
  };

  const isError = statusMsg && (statusMsg.includes('failed') || statusMsg.includes('error'));

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

      <main className="au-auth-main au-login-main">
        <div className="au-panel">
          <div className="au-no">Officer of the watch · Sign in</div>
          <h1>Take over <em>the watch.</em></h1>
          <p className="au-body">Sign in with the Google account you registered. M.A.T.E picks up your vessel and rank profile from there.</p>

          {statusMsg && <div className={`au-status ${isError ? 'err' : 'ok'}`} role="status">{statusMsg}</div>}

          <button type="button" onClick={handleGoogleLogin} disabled={isLoading} className="au-btn au-btn-block au-google">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {isLoading ? 'Connecting to Google…' : 'Sign in with Google'}
          </button>

          <div className="au-handover" aria-label="Watch handover">
            <div><span className="tick">✓</span><span>Position plotted, course and speed noted</span></div>
            <div><span className="tick">✓</span><span>Traffic and nav lights checked</span></div>
            <div><span className="todo">→</span><span className="now">Paperwork handed to M.A.T.E</span></div>
          </div>

          <p className="au-switch">New to M.A.T.E? <Link href="/signup">Register your mariner space</Link></p>
        </div>
      </main>

      <div className="au-auth-console" aria-hidden="true">
        <div className="au-wrap">
          <div className="au-readout">
            <span>POS <b ref={posRef}>18°54.20′N 072°48.70′E</b></span>
            <span>HDG <b ref={headingRef}>074°</b></span>
            <span>UTC <b ref={utcRef}>00:00:00</b></span>
            <span className="live">LINK <b ref={linkRef}>VSAT · standing by</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}
