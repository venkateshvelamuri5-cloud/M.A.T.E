"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/supabase-client';
import { Upload, Mail, CreditCard, Shield, AlertCircle, CheckCircle2, Anchor, LogIn, UserPlus, LogOut, FileText, History, ArrowLeft, Download, Clipboard, Server, Settings, ChevronRight } from 'lucide-react';

interface InteractionLog {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  email_request?: string;
  email_response?: string;
}

interface UploadedFile {
  id: string;
  name: string;
  file_size_mb: number;
  file_type: string;
  storage_path: string;
}

interface Agent {
  id: string;
  name: string;
  description: string;
}

interface AgentTemplate {
  id: string;
  agent_id: string;
  task_name: string;
  description: string;
  template_body: string;
}

export default function UserDashboard() {
  const router = useRouter();
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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([]);
  const [interactionsCount, setInteractionsCount] = useState(0);
  const [maxInteractions, setMaxInteractions] = useState(10);
  const [subscriptionPlan, setSubscriptionPlan] = useState('free');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [interactionHistory, setInteractionHistory] = useState<InteractionLog[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<InteractionLog | null>(null);

  // Live Agent Web Runner States
  const [webRunAgentId, setWebRunAgentId] = useState('');
  const [webRunQueryInput, setWebRunQueryInput] = useState('');
  const [webRunSelectedFiles, setWebRunSelectedFiles] = useState<string[]>([]);
  const [isWebRunning, setIsWebRunning] = useState(false);
  const [webRunResult, setWebRunResult] = useState<string | null>(null);

  const handleToggleFileSelection = (fileId: string) => {
    setWebRunSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleWebRunSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !webRunAgentId || !webRunQueryInput) {
      setStatusMsg("Please select an agent and fill in the task query.");
      return;
    }

    setIsWebRunning(true);
    setStatusMsg("Running AI agent, validating workspace files...");
    setWebRunResult(null);

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          agentId: webRunAgentId,
          queryInput: webRunQueryInput,
          selectedFileIds: webRunSelectedFiles
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server error running agent');
      }

      setWebRunResult(data.result);
      setStatusMsg("Agent finished successfully! You can view the output below.");
      fetchUserData(userId, emailInput);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Execution failed: ${(err as Error).message}`);
    } finally {
      setIsWebRunning(false);
    }
  };

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
        } else {
          router.push('/login');
        }
      } catch (err) {
        console.warn("Auth check failed, check your Supabase credentials.");
        router.push('/login');
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

      // 5. Fetch agents and templates
      const { data: dbAgents } = await supabase
        .from('agents')
        .select('*');
      if (dbAgents) {
        setAgents(dbAgents);
      }

      const { data: dbTemplates } = await supabase
        .from('agent_templates')
        .select('*');
      if (dbTemplates) {
        setAgentTemplates(dbTemplates);
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
              company_name: companyInput,
              vessel_email: vesselEmailInput
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
      console.error("Auth error occurred:", err);
      const errMsg = err && typeof err === 'object'
        ? (err as any).message || (err as any).error_description || JSON.stringify(err)
        : String(err);
      setStatusMsg(`Auth failed: ${errMsg}`);
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
    setAgents([]);
    setAgentTemplates([]);
    setUploadedFiles([]);
    setInteractionHistory([]);
    setStatusMsg("Signed out of your workspace.");
  };

  // Real Upload Handler supporting .pdf, .docx, .txt, .md
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId || !e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));
    
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
      const storagePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('user-spaces')
        .upload(storagePath, file);

      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await supabase
        .from('user_files')
        .insert({
          user_id: userId,
          name: file.name,
          storage_path: storagePath,
          file_type: fileExtension.substring(1),
          file_size_mb: fileSizeMB
        });

      if (dbErr) throw dbErr;

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

  const handleCopyTemplate = (templateBody: string, taskName: string) => {
    navigator.clipboard.writeText(templateBody);
    setStatusMsg(`Copied template for "${taskName}" to your clipboard!`);
    setTimeout(() => {
      setStatusMsg(null);
    }, 4500);
  };

  // Auth Screen Render
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6 selection:bg-gold selection:text-deep">
        <div className="flex flex-col items-center">
          <img src="/logo.jpeg" alt="M.A.T.E logo" width="64" height="64" className="rounded-xl border border-border/80 shadow-sm animate-pulse mb-4" />
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Verifying Session...</p>
        </div>
      </div>
    );
  }

  // Dashboard Screen Render
  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12 selection:bg-gold selection:text-deep relative">
      
      {/* Top Navbar */}
      <div className="flex justify-between items-center mb-12 max-w-6xl mx-auto border-b border-border/60 pb-6 relative z-10">
        <Link href="/" className="flex items-center gap-2.5 group">
          <img src="/logo.jpeg" alt="M.A.T.E logo" width="32" height="32" className="rounded" />
          <span className="text-base font-black tracking-tight text-deep uppercase font-display">M.A.T.E Space</span>
        </Link>
        <button 
          onClick={handleLogout}
          className="text-xs text-foreground hover:bg-secondary transition flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-border font-bold uppercase tracking-wider"
        >
          <LogOut className="w-3.5 h-3.5 text-gold" /> Sign Out
        </button>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        
        {/* Left column (Profile, Settings, Storage) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border-2 border-[#1b1b1b] p-8 rounded-xl shadow-[4px_4px_0px_0px_#1b1b1b]">
            <span className="text-[9px] font-bold text-[#575ECF] uppercase tracking-wider block mb-1">Authenticated Officer</span>
            <div className="text-base font-black text-[#1b1b1b] mb-0.5">{fullNameInput || 'Officer'}</div>
            <div className="text-xs text-zinc-650 font-medium mb-0.5">{rankInput || 'Unspecified Rank'}</div>
            <div className="text-[11px] text-zinc-500 mb-1">{companyInput ? `Company: ${companyInput}` : 'No Company Configured'}</div>
            <div className="text-[11px] text-zinc-500 italic mb-6 break-all">{vesselEmailInput ? `Vessel Email: ${vesselEmailInput}` : 'No Vessel Email Configured'}</div>

            <h3 className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Monthly Agent Interactions</h3>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-3xl font-black text-[#1b1b1b]">{interactionsCount}</span>
              <span className="text-xs text-zinc-500">/ {maxInteractions} interactions used</span>
            </div>

            <div className="space-y-2 mb-6">
              <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden border border-[#dcdad5]">
                <div 
                  className="h-full bg-[#575ECF] rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min((interactionsCount / (maxInteractions || 1)) * 100, 100)}%` }}
                />
              </div>
            </div>

            <h3 className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Dedicated Storage Space</h3>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-3xl font-black text-[#1b1b1b]">{totalSpaceUsedMB}</span>
              <span className="text-xs text-zinc-500">/ {subscriptionPlan === 'premium' ? "5,000" : STORAGE_LIMIT_MB} MB used</span>
            </div>

            <div className="space-y-2 mb-6">
              <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden border border-[#dcdad5]">
                <div 
                  className="h-full bg-[#575ECF] rounded-full transition-all duration-500" 
                  style={{ width: `${(totalSpaceUsedMB / (subscriptionPlan === 'premium' ? 5000 : STORAGE_LIMIT_MB)) * 100}%` }}
                />
              </div>
            </div>

            {subscriptionPlan !== 'premium' && (
              <div className="bg-amber-50 border border-[#FE7B02]/30 p-4 rounded-lg flex gap-3 text-amber-800 text-xs leading-relaxed mb-6">
                <AlertCircle className="w-4.5 h-4.5 shrink-0 text-[#FE7B02]" />
                <span>You are utilizing your free 25MB space. Upgrade for 5GB limits.</span>
              </div>
            )}

            {subscriptionPlan !== 'premium' && (
              <button 
                onClick={handleStripeCheckout}
                className="w-full py-2.5 rounded-lg bg-[#575ECF] hover:bg-[#464cb3] text-white font-bold text-xs uppercase tracking-wider transition shadow-sm"
              >
                Upgrade Space (Stripe)
              </button>
            )}
          </div>

          {/* Workspace Settings Card */}
          <div className="bg-white border border-[#dcdad5] p-6 rounded-xl shadow-sm">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-[#575ECF]" /> Workspace Settings
            </h3>
            <form onSubmit={handleSaveSettings} className="space-y-3.5">
              <div>
                <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={fullNameInput}
                  onChange={e => setFullNameInput(e.target.value)}
                  className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] bg-[#FCFBF8] rounded-lg text-xs outline-none text-[#1b1b1b] transition font-medium"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Company Name</label>
                <input 
                  type="text" 
                  value={companyInput}
                  onChange={e => setCompanyInput(e.target.value)}
                  className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] bg-[#FCFBF8] rounded-lg text-xs outline-none text-[#1b1b1b] transition font-medium"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Mariner Rank</label>
                <input 
                  type="text" 
                  value={rankInput}
                  onChange={e => setRankInput(e.target.value)}
                  className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] bg-[#FCFBF8] rounded-lg text-xs outline-none text-[#1b1b1b] transition font-medium"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Vessel Email (For Webhooks)</label>
                <input 
                  type="email" 
                  value={vesselEmailInput}
                  onChange={e => setVesselEmailInput(e.target.value)}
                  placeholder="vessel@shipname.com"
                  className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] bg-[#FCFBF8] rounded-lg text-xs outline-none text-[#1b1b1b] transition font-medium"
                />
              </div>
              <button 
                type="submit" 
                className="w-full py-2.5 bg-[#575ECF] hover:bg-[#464cb3] text-white rounded-lg font-bold text-[10px] uppercase tracking-wider transition"
              >
                Save Settings
              </button>
            </form>
          </div>

          {/* Onboarding Guide Card */}
          <div className="bg-white border border-[#dcdad5] p-6 rounded-xl shadow-sm">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Onboarding Instructions</h3>
            <div className="space-y-3 text-xs text-zinc-650 leading-relaxed font-medium">
              <p>To verify logs or endorsement credentials: </p>
              <ol className="list-decimal list-inside space-y-2 pl-1 text-[11px] text-zinc-600">
                <li>Attach your voyage logs as PDF.</li>
                <li>Email them to: <strong className="text-[#1b1b1b] select-all">hello@logmark-ai.com</strong>.</li>
                <li>The response report PDF will land in your inbox.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Right column (Storage Space, Copy Templates, Logs) */}
        <div className="lg:col-span-2 space-y-6">
          {statusMsg && (
            <div className={`p-4 rounded-lg text-xs border-2 ${
              statusMsg.includes('failed') || statusMsg.includes('error')
                ? 'bg-red-50 border-[#FE3F21] text-red-700'
                : 'bg-indigo-50 border-[#575ECF] text-indigo-700'
            }`}>
              {statusMsg}
            </div>
          )}

          <div className="bg-white border-2 border-[#1b1b1b] p-8 rounded-xl shadow-[4px_4px_0px_0px_#1b1b1b]">
            <h2 className="text-lg font-black text-[#1b1b1b] mb-1">Isolated Storage Space</h2>
            <p className="text-zinc-500 text-xs mb-6">
              Upload voyage logs and sea service records. Files are confined solely to your space.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {uploadedFiles.length === 0 ? (
                <div className="md:col-span-2 text-center py-6 text-zinc-400 text-xs italic font-medium">No documents uploaded to this workspace.</div>
              ) : (
                uploadedFiles.map(file => (
                  <div key={file.id} className="p-4 bg-[#FCFBF8] border border-[#dcdad5] rounded-lg flex items-center justify-between hover:border-[#1b1b1b] transition">
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-8 h-8 rounded-lg bg-white border border-[#dcdad5] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-[#575ECF]" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-[#1b1b1b] truncate">{file.name}</div>
                        <div className="text-[9px] text-zinc-500">{file.file_size_mb} MB | {file.file_type.toUpperCase()}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => triggerDownload(file)}
                      className="p-1 text-[#1b1b1b]/55 hover:text-[#1b1b1b] transition shrink-0" 
                      title="Download document"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-2 border-dashed border-[#dcdad5] hover:border-[#1b1b1b] rounded-lg p-8 flex flex-col items-center justify-center text-center transition cursor-pointer relative bg-[#FCFBF8]/40">
              <input 
                type="file" 
                accept=".pdf,.docx,.doc,.txt,.md"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="w-6 h-6 text-zinc-400 mb-2" />
              <span className="text-xs font-bold text-zinc-500">
                Upload Document (.pdf, .docx, .doc, .txt, .md)
              </span>
            </div>
          </div>

          {/* Interactive Web Agent Portal */}
          <div className="bg-card border border-border p-8 rounded-xl shadow-sm">
            <h2 className="text-lg font-black text-deep mb-1 font-display">Interactive Web Agent Portal</h2>
            <p className="text-muted-foreground text-xs mb-6 font-medium">
              Run specialized AI agents directly in your web browser. Select an agent, attach reference files, type your request, and execute.
            </p>

            <form onSubmit={handleWebRunSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Select Agent</label>
                <select
                  value={webRunAgentId}
                  onChange={e => setWebRunAgentId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-border bg-background rounded-xl text-xs outline-none text-foreground transition font-medium"
                >
                  <option value="">-- Choose an Agent --</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {uploadedFiles.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Attach Reference Documents (From Workspace)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3.5 bg-background border border-border rounded-xl max-h-40 overflow-y-auto">
                    {uploadedFiles.map(file => (
                      <label key={file.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={webRunSelectedFiles.includes(file.id)}
                          onChange={() => handleToggleFileSelection(file.id)}
                          className="rounded border-border text-gold focus:ring-gold"
                        />
                        <span className="truncate">{file.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Input Task Description / Query</label>
                <textarea
                  required
                  rows={3}
                  value={webRunQueryInput}
                  onChange={e => setWebRunQueryInput(e.target.value)}
                  placeholder="e.g., Generate a risk assessment for hot work aloft on the main mast."
                  className="w-full px-3.5 py-2.5 border border-border bg-background rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={isWebRunning}
                className="px-6 py-3 rounded-full bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold uppercase tracking-wider transition shadow-md shadow-primary/20 w-full sm:w-auto hover:scale-[1.02] transform duration-150"
              >
                {isWebRunning ? "Processing Task..." : "Execute Web Agent"}
              </button>
            </form>

            {webRunResult && (
              <div className="mt-6 border-t border-border pt-6">
                <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">// Generated Output:</span>
                <pre className="p-4 bg-background border border-border rounded-xl text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap select-all max-h-96 overflow-y-auto">
                  {webRunResult}
                </pre>
              </div>
            )}
          </div>

          {/* Available Maritime Tasks & Submission Templates */}
          <div className="bg-card border border-border p-8 rounded-xl shadow-sm">
            <h2 className="text-lg font-black text-[#1b1b1b] mb-1">Task Submission Templates</h2>
            <p className="text-zinc-500 text-xs mb-6 font-medium">
              Select a task below, copy the pre-formatted email template, fill in your parameters, and send it to trigger an agent reply.
            </p>

            <div className="space-y-4">
              {agents.filter(a => agentTemplates.some(t => t.agent_id === a.id)).length === 0 ? (
                <div className="text-xs text-zinc-400 italic py-4 text-center font-medium">No task templates registered in this workspace yet.</div>
              ) : (
                agents.map(agent => {
                  const templates = agentTemplates.filter(t => t.agent_id === agent.id);
                  if (templates.length === 0) return null;
                  return (
                    <div key={agent.id} className="p-4 bg-[#FCFBF8] border border-[#dcdad5] rounded-lg">
                      <h4 className="text-xs font-bold text-[#1b1b1b] mb-1">{agent.name}</h4>
                      <p className="text-[10px] text-zinc-500 mb-3 font-medium">{agent.description}</p>
                      
                      <div className="space-y-2.5">
                        {templates.map(t => (
                          <div key={t.id} className="p-3.5 bg-white border border-[#dcdad5] rounded-lg flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:border-[#1b1b1b] transition">
                            <div>
                              <div className="text-xs font-bold text-[#1b1b1b]">{t.task_name}</div>
                              <div className="text-[10px] text-zinc-500 leading-normal font-medium">{t.description}</div>
                            </div>
                            <button
                              onClick={() => handleCopyTemplate(t.template_body, t.task_name)}
                              className="px-4 py-2 rounded-lg bg-[#575ECF] hover:bg-[#464cb3] text-white text-[10px] font-bold uppercase tracking-wider transition shrink-0 self-start sm:self-center"
                            >
                              Copy Email Draft
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white border-2 border-[#1b1b1b] p-8 rounded-xl shadow-[4px_4px_0px_0px_#1b1b1b]">
            <div className="flex items-center gap-2 mb-6">
              <History className="w-4.5 h-4.5 text-[#575ECF]" />
              <h2 className="text-lg font-black text-[#1b1b1b]">Your Voyage Interaction Log</h2>
            </div>

            <div className="space-y-3">
              {interactionHistory.length === 0 ? (
                <div className="text-zinc-400 text-xs text-center py-6 italic font-medium">No interactions logged yet.</div>
              ) : (
                interactionHistory.map(log => (
                  <div key={log.id} onClick={() => setSelectedLog(log)} className="flex justify-between items-center p-3.5 bg-card border border-border rounded-lg text-[11px] hover:border-gold hover:shadow-sm transition cursor-pointer">
                    <div className="font-bold text-zinc-700">{log.subject}</div>
                    <div className="flex items-center gap-4">
                      <span className="text-zinc-450 font-medium">
                        {new Date(log.created_at || Date.now()).toISOString().replace('T', ' ').substring(0, 16)}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border text-center ${
                        log.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                        log.status === 'Failed' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                        'bg-zinc-100 text-zinc-500 border-border'
                      }`}>
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

      {/* Selected Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-[#1b1b1b]/40 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-[#FAF9F6] border-b border-border px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-display text-sm font-semibold text-deep">{selectedLog.subject}</h3>
                <span className="text-[9px] text-muted-foreground">
                  {new Date(selectedLog.created_at || Date.now()).toISOString().replace('T', ' ').substring(0, 16)}
                </span>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-secondary font-bold uppercase transition"
              >
                Close
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 font-sans text-xs">
              <div>
                <span className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">// Email Request:</span>
                <div className="bg-background border border-border p-4 rounded-xl text-foreground font-medium leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {selectedLog.email_request || "No request text body logged."}
                </div>
              </div>
              
              <div>
                <span className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">// AI Response Output:</span>
                <div className="bg-[#FAF9F6] border border-border p-4 rounded-xl text-deep font-mono leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {selectedLog.email_response || "No response text generated."}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
