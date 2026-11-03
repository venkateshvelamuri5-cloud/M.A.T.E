"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/supabase-client';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    <main className={styles.page}>
      <Link href="/" prefetch={false} className={styles.home}>← Home</Link>

      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3"/></svg>
          </span>
          M.A.T.E
        </div>

        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.sub}>Use the Google account you registered with.</p>

        {statusMsg && <div className={`${styles.status} ${isError ? styles.err : styles.ok}`} role="status">{statusMsg}</div>}

        <button type="button" onClick={handleGoogleLogin} disabled={isLoading} className={styles.google}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {isLoading ? 'Connecting to Google…' : 'Sign in with Google'}
        </button>

        <p className={styles.switch}>New to M.A.T.E? <Link href="/signup" prefetch={false}>Register</Link></p>
      </div>

      <p className={styles.foot}>Made by seafarers for seafarers.</p>
    </main>
  );
}
