"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/supabase-client';
import { Anchor, ArrowLeft, Mail, Lock, UserPlus, Shield, User } from 'lucide-react';

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsLoading(true);

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
        setStatusMsg("Account successfully registered! Sending welcome email...");

        // Fire welcome email — non-blocking, don't await so signup isn't delayed
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6 relative selection:bg-gold selection:text-deep">
      {/* Back button */}
      <Link href="/" className="absolute top-6 left-6 text-muted-foreground hover:text-foreground transition text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 bg-card/60 px-4 py-2 rounded-full border border-border/80 shadow-sm">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      <div className="w-full max-w-lg bg-card border border-border p-8 rounded-2xl shadow-md relative">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <img src="/logo.jpeg" alt="M.A.T.E logo" width="48" height="48" className="rounded-xl border border-border/80 shadow-sm" />
          </Link>
          <h2 className="font-display text-2xl font-semibold text-deep">Register Mariner Space</h2>
          <p className="text-muted-foreground text-xs mt-1 text-center">
            Configure your dedicated 25MB file space and configure vessel emails.
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

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                <input 
                  type="text" 
                  required
                  value={fullNameInput}
                  onChange={e => setFullNameInput(e.target.value)}
                  placeholder="Capt. John Doe"
                  className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Mariner Rank</label>
              <div className="relative">
                <Shield className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                <input 
                  type="text" 
                  required
                  value={rankInput}
                  onChange={e => setRankInput(e.target.value)}
                  placeholder="Chief Mate"
                  className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Company Name</label>
              <input 
                type="text" 
                required
                value={companyInput}
                onChange={e => setCompanyInput(e.target.value)}
                placeholder="Merchant Shipping Ltd"
                className="w-full px-3.5 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Vessel Email (from ship)</label>
              <input 
                type="email" 
                required
                value={vesselEmailInput}
                onChange={e => setVesselEmailInput(e.target.value)}
                placeholder="pioneer@vessel-net.com"
                className="w-full px-3.5 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Login Email (regular email)</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
              <input 
                type="email" 
                required
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="john.doe@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
              />
            </div>
          </div>

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
            {isLoading ? "Registering..." : <>Register Space <UserPlus className="w-4 h-4" /></>}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-border/60 text-center">
          <p className="text-xs text-muted-foreground">
            Already registered?{" "}
            <Link href="/login" className="text-gold font-bold hover:underline transition">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
