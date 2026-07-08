"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/supabase-client';
import { ArrowLeft, Mail, Lock, LogIn } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput,
        password: passwordInput,
      });
      if (error) throw error;
      if (data.user) {
        setStatusMsg("Successfully signed in.");
        router.push('/dashboard');
      }
    } catch (err) {
      console.error("Auth error occurred:", err);
      const errMsg = err && typeof err === 'object'
        ? (err as any).message || (err as any).error_description || JSON.stringify(err)
        : String(err);
      setStatusMsg(`Auth failed: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6 relative selection:bg-gold selection:text-deep">
      {/* Back button */}
      <Link href="/" className="absolute top-6 left-6 text-muted-foreground hover:text-foreground transition text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 bg-card/60 px-4 py-2 rounded-full border border-border/80 shadow-sm">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      <div className="w-full max-w-md bg-card border border-border p-8 rounded-2xl shadow-md relative">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <img src="/logo.jpeg" alt="M.A.T.E logo" width="48" height="48" className="rounded-xl border border-border/80 shadow-sm" />
          </Link>
          <h2 className="font-display text-2xl font-semibold text-deep">Sign In to M.A.T.E</h2>
          <p className="text-muted-foreground text-xs mt-1 text-center">
            Access your isolated certificate and voyage logs space.
          </p>
        </div>

        {statusMsg && (
          <div className={`p-3.5 rounded-xl text-xs mb-4 border ${
            statusMsg.includes('failed') || statusMsg.includes('error')
              ? 'bg-red-50/50 border-red-200 text-red-700'
              : 'bg-green-50/50 border-green-200 text-green-700'
          }`}>
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
              <input 
                type="email" 
                required
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="mariner@vessel-mail.com"
                className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
              />
            </div>
          </div>

          {emailInput.toLowerCase().includes('gmail') ? (
            <div className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl text-xs border bg-amber-50/50 border-amber-200 text-amber-800 font-medium">
                Gmail accounts are required to log in securely with Google Sign-In.
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full py-3 rounded-full border border-border bg-[#FAF9F6] hover:bg-[#F5F4F0] text-foreground font-semibold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 hover:scale-[1.02] transform duration-150 shadow-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="password" 
                    required
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full py-3 rounded-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs uppercase tracking-wider transition shadow-md shadow-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] transform duration-150"
              >
                {isLoading ? "Signing in..." : <>Sign In <LogIn className="w-4 h-4" /></>}
              </button>
            </div>
          )}
        </form>

        <div className="mt-6 pt-6 border-t border-border/60 text-center">
          <p className="text-xs text-muted-foreground">
            Don't have a mariner workspace?{" "}
            <Link href="/signup" className="text-gold font-bold hover:underline transition">
              Create one now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
