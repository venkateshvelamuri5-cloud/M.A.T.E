"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../src/supabase-client';
import { Upload, Mail, CreditCard, Shield, AlertCircle, CheckCircle, Anchor, LogIn, UserPlus, LogOut, FileText, History, ArrowLeft, Download } from 'lucide-react';

interface InteractionLog {
  id: string;
  subject: string;
  status: string;
  created_at: string;
}

interface UploadedFile {
  id: string;
  name: string;
  file_size_mb: number;
  file_type: string;
  storage_path: string;
}

export default function UserDashboard() {
  // Authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [rankInput, setRankInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [vesselEmailInput, setVesselEmailInput] = useState('');

  // Dashboard metrics states
  const [interactionsCount, setInteractionsCount] = useState(0);
  const [maxInteractions, setMaxInteractions] = useState(10);
  const [subscriptionPlan, setSubscriptionPlan] = useState('free');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [interactionHistory, setInteractionHistory] = useState<InteractionLog[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const STORAGE_LIMIT_MB = 25;

  // Track storage calculation
  const totalSpaceUsedMB = parseFloat(
    uploadedFiles.reduce((acc, file) => acc + Number(file.file_size_mb), 0).toFixed(2)
  );

  // Check active user session on load
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setIsLoggedIn(true);
          setUserId(session.user.id);
          setEmailInput(session.user.email || '');
          fetchUserData(session.user.id, session.user.email || '');
        }
      } catch (err) {
        console.warn("Auth check failed, check your Supabase credentials.");
      }
    };
    checkSession();
  }, []);

  // Fetch real data from Supabase DB and Storage lists
  const fetchUserData = async (uid: string, email: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch or create Profile
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (!profile) {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ 
            id: uid, 
            email, 
            role: 'user', 
            subscription_plan: 'free', 
            full_name: fullNameInput || null, 
            rank: rankInput || null,
            company_name: companyInput || null,
            vessel_email: vesselEmailInput || null
          })
          .select()
          .single();
        profile = newProfile;
      } else {
        if (!profile.full_name && fullNameInput) {
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .update({
              full_name: fullNameInput,
              rank: rankInput || null,
              company_name: companyInput || null,
              vessel_email: vesselEmailInput || null
            })
            .eq('id', uid)
            .select()
            .single();
          if (updatedProfile) profile = updatedProfile;
        } else {
          setFullNameInput(profile.full_name || '');
          setRankInput(profile.rank || '');
          setCompanyInput(profile.company_name || '');
          setVesselEmailInput(profile.vessel_email || '');
        }
      }

      if (profile) {
        setSubscriptionPlan(profile.subscription_plan);
      }

      // 2. Fetch Limits
      let { data: limits } = await supabase
        .from('usage_limits')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();

      if (!limits && profile) {
        const { data: newLimits } = await supabase
          .from('usage_limits')
          .insert({ user_id: uid, interactions_count: 0, max_interactions: 10 })
          .select()
          .single();
        limits = newLimits;
      }

      if (limits) {
        setInteractionsCount(limits.interactions_count);
        setMaxInteractions(limits.max_interactions);
      }

      // 3. Fetch Uploaded Files List
      const { data: files } = await supabase
        .from('user_files')
        .select('*')
        .eq('user_id', uid);

      if (files) {
        setUploadedFiles(files);
      }

      // 4. Fetch Interaction Log List
      const { data: logs } = await supabase
        .from('interactions_log')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (logs) {
        setInteractionHistory(logs);
      }

    } catch (err) {
      console.error('Failed to query user metrics from Supabase:', err);
      setStatusMsg('Could not fetch active workspace profile details.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auth Action Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsLoading(true);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: emailInput,
          password: passwordInput,
          options: {
            data: {
              full_name: fullNameInput,
              rank: rankInput,
              company_name: companyInput
            }
          }
        });
        if (error) throw error;
        if (data.user) {
          setUserId(data.user.id);
          setIsLoggedIn(true);
          await fetchUserData(data.user.id, emailInput);
          setStatusMsg("Account successfully registered! 25MB dedicated space ready.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailInput,
          password: passwordInput,
        });
        if (error) throw error;
        if (data.user) {
          setUserId(data.user.id);
          setIsLoggedIn(true);
          await fetchUserData(data.user.id, emailInput);
          setStatusMsg("Successfully signed in.");
        }
      }
    } catch (err) {
      setStatusMsg(`Auth failed: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };


  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setStatusMsg("Saving workspace settings...");
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullNameInput || null,
          company_name: companyInput || null,
          rank: rankInput || null,
          vessel_email: vesselEmailInput || null
        })
        .eq('id', userId);

      if (error) throw error;
      setStatusMsg("Workspace settings updated successfully.");
      fetchUserData(userId, emailInput);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to save settings: ${(err as Error).message}`);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setUserId(null);
    setEmailInput('');
    setPasswordInput('');
    setFullNameInput('');
    setRankInput('');
    setCompanyInput('');
    setVesselEmailInput('');
    setUploadedFiles([]);
    setInteractionHistory([]);
    setStatusMsg("Signed out of your workspace.");
  };

  // Real Upload Handler supporting .pdf, .docx, .txt, .md
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId || !e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));
    
    // Strict file type validation
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      setStatusMsg(`Upload failed. Only PDF, DOCX, DOC, TXT, and MD files are allowed.`);
      return;
    }

    if (totalSpaceUsedMB + fileSizeMB > (subscriptionPlan === 'premium' ? 5000 : STORAGE_LIMIT_MB)) {
      setStatusMsg(`Upload failed. This file exceeds your storage capacity limit.`);
      return;
    }

    setStatusMsg('Uploading file to storage bucket...');

    try {
      // 1. Upload to bucket under isolated user directory path: spaces/{userId}/{fileName}
      const storagePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('user-spaces')
        .upload(storagePath, file);

      if (uploadErr) throw uploadErr;

      // 2. Register file reference in user_files DB Table
      const { error: dbErr } = await supabase
        .from('user_files')
        .insert({
          user_id: userId,
          name: file.name,
          storage_path: storagePath,
          file_type: fileExtension.substring(1), // e.g. 'pdf', 'docx'
          file_size_mb: fileSizeMB
        });

      if (dbErr) throw dbErr;

      // 3. Add to interaction history log
      await supabase.from('interactions_log').insert({
        user_id: userId,
        subject: `Uploaded document: ${file.name}`,
        status: 'Completed'
      });

      setStatusMsg(`Successfully uploaded "${file.name}" to your workspace.`);
      fetchUserData(userId, emailInput);

    } catch (err) {
      console.error(err);
      setStatusMsg(`File upload error: ${(err as Error).message}`);
    }
  };

  const handleStripeCheckout = async () => {
    if (!userId || !emailInput) return;
    setStatusMsg("Redirecting to Stripe checkout session...");
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailInput }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (err) {
      console.error(err);
      setStatusMsg(`Stripe redirect error: ${(err as Error).message}`);
    }
  };

  const triggerDownload = async (file: UploadedFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('user-spaces')
        .download(file.storage_path);
      if (error) throw error;
      const url = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setStatusMsg(`Download failed: ${(err as Error).message}`);
    }
  };

  // Auth Screen Render
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#fafafb] text-slate-800 flex flex-col justify-center items-center font-sans p-6">
        <Link href="/" className="flex items-center gap-2 mb-8">
          <Anchor className="w-8 h-8 text-slate-700" />
          <span className="text-xl font-bold tracking-tight text-slate-900">M.A.T.E</span>
        </Link>

        <div className="w-full max-w-sm bg-white border border-slate-200 p-8 rounded-xl shadow-sm relative">
          <Link href="/" className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 transition text-[10px] font-semibold flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>

          <h2 className="text-lg font-bold mb-1 text-slate-900">
            {authMode === 'signin' ? "Sign In to M.A.T.E" : "Register Community Space"}
          </h2>
          <p className="text-slate-500 text-xs mb-6 leading-relaxed">
            {authMode === 'signin' 
              ? "Access your isolated certificate and voyage logs space." 
              : "Register to initialize your dedicated 25MB file space."}
          </p>

          {statusMsg && (
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-slate-650 text-xs mb-4">
              {statusMsg}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input 
                    type="text" 
                    required
                    value={fullNameInput}
                    onChange={e => setFullNameInput(e.target.value)}
                    placeholder="Capt. John Doe"
                    className="w-full px-3.5 py-2 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Company Name</label>
                  <input 
                    type="text" 
                    required
                    value={companyInput}
                    onChange={e => setCompanyInput(e.target.value)}
                    placeholder="Merchant Shipping Ltd"
                    className="w-full px-3.5 py-2 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Mariner Rank</label>
                  <input 
                    type="text" 
                    required
                    value={rankInput}
                    onChange={e => setRankInput(e.target.value)}
                    placeholder="Chief Mate"
                    className="w-full px-3.5 py-2 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
              <input 
                type="email" 
                required
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="officer@merchantnavy.com"
                className="w-full px-3.5 py-2 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
              <input 
                type="password" 
                required
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-2.5 mt-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition disabled:opacity-55"
            >
              {isLoading ? "Processing..." : authMode === 'signin' ? "Sign In" : "Register and Open Workspace"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
            {authMode === 'signin' ? (
              <span>
                Need an officer workspace?{" "}
                <button onClick={() => { setAuthMode('signup'); setStatusMsg(null); }} className="text-slate-850 font-bold hover:underline">
                  Create space
                </button>
              </span>
            ) : (
              <span>
                Already registered?{" "}
                <button onClick={() => { setAuthMode('signin'); setStatusMsg(null); }} className="text-slate-850 font-bold hover:underline">
                  Sign in here
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Screen Render
  return (
    <div className="min-h-screen bg-[#fafafb] text-slate-800 font-sans p-6 md:p-12 selection:bg-slate-900 selection:text-white">
      <div className="flex justify-between items-center mb-12 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <Anchor className="w-6 h-6 text-slate-700" />
          <span className="text-base font-bold tracking-tight text-slate-900">M.A.T.E Space</span>
        </Link>
        <button 
          onClick={handleLogout}
          className="text-xs text-slate-500 hover:text-slate-900 transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign Out
        </button>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Authenticated Officer</h3>
            <div className="text-xs font-semibold text-slate-800 truncate mb-0.5">{fullNameInput || 'Officer'}</div>
            <div className="text-[10px] text-slate-550 font-medium mb-0.5">{rankInput || 'Unspecified Rank'}</div>
            <div className="text-[10px] text-slate-500 mb-1">{companyInput ? `Company: ${companyInput}` : 'No Company Configured'}</div>
            <div className="text-[10px] text-slate-400 italic mb-4">{vesselEmailInput ? `Vessel Email: ${vesselEmailInput}` : 'No Vessel Email Configured'}</div>

            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dedicated Storage</h3>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-3xl font-extrabold text-slate-900">
                {totalSpaceUsedMB} <span className="text-sm font-normal text-slate-400">/ {subscriptionPlan === 'premium' ? "5,000" : STORAGE_LIMIT_MB} MB</span>
              </span>
            </div>

            <div className="space-y-2 mb-6">
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-slate-800 rounded-full transition-all duration-500" 
                  style={{ width: `${(totalSpaceUsedMB / (subscriptionPlan === 'premium' ? 5000 : STORAGE_LIMIT_MB)) * 100}%` }}
                />
              </div>
            </div>

            {subscriptionPlan !== 'premium' && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex gap-3 text-amber-800 text-[11px] leading-relaxed mb-6">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>You are utilizing your free 25MB space. Upgrade for 5GB limits.</span>
              </div>
            )}

            {subscriptionPlan !== 'premium' && (
              <button 
                onClick={handleStripeCheckout}
                className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition shadow-sm"
              >
                Upgrade Space (Stripe)
              </button>
            )}
          </div>

          {/* Workspace Settings Card */}
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Workspace Settings</h3>
            <form onSubmit={handleSaveSettings} className="space-y-3.5">
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={fullNameInput}
                  onChange={e => setFullNameInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Company Name</label>
                <input 
                  type="text" 
                  value={companyInput}
                  onChange={e => setCompanyInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mariner Rank</label>
                <input 
                  type="text" 
                  value={rankInput}
                  onChange={e => setRankInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vessel Email (For Webhooks)</label>
                <input 
                  type="email" 
                  value={vesselEmailInput}
                  onChange={e => setVesselEmailInput(e.target.value)}
                  placeholder="vessel@shipname.com"
                  className="w-full px-2.5 py-1.5 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
                />
              </div>
              <button 
                type="submit" 
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-[10px] uppercase tracking-wider transition"
              >
                Save Settings
              </button>
            </form>
          </div>

          {/* Onboarding Guide Card */}
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Onboarding Instructions</h3>
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>To verify logs or endorsement credentials: </p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Attach your voyage logs as PDF.</li>
                <li>Email them to: <strong className="text-slate-800 select-all">verify@mate-navy.com</strong> from your registered email or configured vessel email.</li>
                <li>M.A.T.E will parse context and send the PDF response back.</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {statusMsg && (
            <div className="bg-slate-100 border border-slate-200 p-4 rounded-lg text-slate-700 text-xs">
              {statusMsg}
            </div>
          )}

          <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold mb-1 text-slate-900">Isolated Storage Space</h2>
            <p className="text-slate-500 text-xs mb-6">
              Upload voyage logs and sea service records. Files are confined solely to your space.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {uploadedFiles.map(file => (
                <div key={file.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-slate-800 truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-400">{file.file_size_mb} MB | {file.file_type.toUpperCase()}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => triggerDownload(file)}
                    className="p-1 text-slate-500 hover:text-slate-900 transition shrink-0" 
                    title="Download document"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-lg p-8 flex flex-col items-center justify-center text-center transition cursor-pointer relative">
              <input 
                type="file" 
                accept=".pdf,.docx,.doc,.txt,.md"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-600">
                Upload Document (.pdf, .docx, .doc, .txt, .md)
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <History className="w-4 h-4 text-slate-600" />
              <h2 className="text-lg font-bold text-slate-900">Your Voyage Interaction Log</h2>
            </div>

            <div className="space-y-3">
              {interactionHistory.length === 0 ? (
                <div className="text-slate-450 text-xs text-center py-6">No interactions logged yet.</div>
              ) : (
                interactionHistory.map(log => (
                  <div key={log.id} className="flex justify-between items-center p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px]">
                    <div className="font-semibold text-slate-700">{log.subject}</div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400">
                        {new Date(log.created_at || Date.now()).toISOString().replace('T', ' ').substring(0, 16)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/60 text-slate-700 font-semibold border border-slate-300/30">
                        {log.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
