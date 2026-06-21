"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../src/supabase-client';
import { Upload, FileText, Database, Plus, CheckCircle, ArrowLeft, Trash2, TrendingUp, DollarSign, Activity, Users } from 'lucide-react';

interface KnowledgeFile {
  id: string;
  name: string;
  file_size_mb: number;
  created_at: string;
  storage_path: string;
  agent_id?: string | null;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
}

interface ActivityLog {
  id: string;
  created_at: string;
  subject: string;
  status: string;
  error_message?: string | null;
  profiles?: { email: string } | null;
  agents?: { name: string } | null;
}

export default function AnalystPortal() {
  const [kbFiles, setKbFiles] = useState<KnowledgeFile[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAnalyst, setIsAnalyst] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Business Analytics states
  const [totalActiveUsers, setTotalActiveUsers] = useState(0);
  const [activeSubscribers, setActiveSubscribers] = useState(0);
  const [totalInteractions, setTotalInteractions] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Agent Management states
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');
  const [selectedAgentForUpload, setSelectedAgentForUpload] = useState<string>('global');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Fetch real analytics parameters from Supabase tables
  const fetchAnalyticsAndFiles = async () => {
    setIsLoading(true);
    try {
      const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      setTotalActiveUsers(usersCount || 0);

      const { count: premiumCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_plan', 'premium');
      setActiveSubscribers(premiumCount || 0);

      const { count: interactionCount } = await supabase
        .from('interactions_log')
        .select('*', { count: 'exact', head: true });
      setTotalInteractions(interactionCount || 0);

      const { data: files } = await supabase
        .from('user_files')
        .select('*')
        .or('file_type.eq.knowledge_base,agent_id.not.is.null');
      if (files) {
        setKbFiles(files);
      }

      const { data: dbAgents } = await supabase
        .from('agents')
        .select('*');
      if (dbAgents) {
        setAgents(dbAgents);
      }

      const { data: logs } = await supabase
        .from('interactions_log')
        .select('id, created_at, subject, status, error_message, profiles(email), agents(name)')
        .order('created_at', { ascending: false });
      if (logs) {
        setActivityLogs(logs as any[]);
      }

    } catch (err) {
      console.error('Failed to query analyst metrics from Supabase:', err);
      setStatusMsg('Error connecting to Supabase database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile?.role === 'analyst') {
            setIsLoggedIn(true);
            setIsAnalyst(true);
            fetchAnalyticsAndFiles();
          } else {
            setAuthError("Unauthorized: Restricted to analyst accounts only.");
            await supabase.auth.signOut();
          }
        }
      } catch (err) {
        console.warn("Session check error:", err);
      }
    };
    checkSession();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput,
        password: passwordInput
      });

      if (error) throw error;

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile?.role === 'analyst') {
          setIsLoggedIn(true);
          setIsAnalyst(true);
          fetchAnalyticsAndFiles();
        } else {
          setAuthError("Unauthorized: Restricted to analyst accounts only.");
          await supabase.auth.signOut();
        }
      }
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsAnalyst(false);
    setEmailInput('');
    setPasswordInput('');
  };

  // Calculate costs and revenue
  const monthlyRecurringRevenue = activeSubscribers * 29;
  const estimatedGeminiCost = parseFloat((totalInteractions * 0.0005).toFixed(4));
  const estimatedSmtpCost = parseFloat((totalInteractions * 0.0001).toFixed(4));
  const totalIncurredCost = parseFloat((estimatedGeminiCost + estimatedSmtpCost).toFixed(4));

  // Real Upload Handler to Supabase Storage bucket 'knowledge-base'
  const handleUploadKB = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));
    setStatusMsg('Uploading to knowledge-base storage...');

    try {
      const storagePath = `general/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('knowledge-base')
        .upload(storagePath, file);

      if (uploadErr) throw uploadErr;

      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || '11111111-1111-1111-1111-111111111111';

      const { error: dbErr } = await supabase
        .from('user_files')
        .insert({
          user_id: currentUserId,
          name: file.name,
          storage_path: storagePath,
          file_type: 'knowledge_base',
          file_size_mb: fileSizeMB,
          agent_id: selectedAgentForUpload === 'global' ? null : selectedAgentForUpload
        });

      if (dbErr) throw dbErr;

      setStatusMsg(`Successfully uploaded and indexed "${file.name}" in knowledge base.`);
      fetchAnalyticsAndFiles();

    } catch (err) {
      console.error(err);
      setStatusMsg(`Upload error: ${(err as Error).message}`);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName || !newAgentDesc || !newAgentPrompt) return;
    setStatusMsg('Creating agent...');
    try {
      const { error } = await supabase
        .from('agents')
        .insert({
          name: newAgentName,
          description: newAgentDesc,
          system_prompt: newAgentPrompt
        });
      if (error) throw error;
      setStatusMsg(`Successfully created agent "${newAgentName}"`);
      setNewAgentName('');
      setNewAgentDesc('');
      setNewAgentPrompt('');
      fetchAnalyticsAndFiles();
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to create agent: ${(err as Error).message}`);
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    setStatusMsg(`Deleting agent ${name}...`);
    try {
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setStatusMsg(`Successfully deleted agent "${name}"`);
      fetchAnalyticsAndFiles();
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to delete agent: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (file: KnowledgeFile) => {
    setStatusMsg(`Deleting ${file.name}...`);
    try {
      await supabase.storage
        .from('knowledge-base')
        .remove([file.storage_path]);

      await supabase
        .from('user_files')
        .delete()
        .eq('id', file.id);

      setStatusMsg(`Successfully deleted reference document: ${file.name}`);
      fetchAnalyticsAndFiles();
    } catch (err) {
      console.error(err);
      setStatusMsg(`Delete error: ${(err as Error).message}`);
    }
  };

  if (!isLoggedIn || !isAnalyst) {
    return (
      <div className="min-h-screen bg-[#fafafb] text-slate-800 flex flex-col justify-center items-center font-sans p-6">
        <div className="w-full max-w-sm bg-white border border-slate-200 p-8 rounded-xl shadow-sm relative">
          <Link href="/" className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 transition text-[10px] font-semibold flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </Link>

          <h2 className="text-lg font-bold mb-1 text-slate-900 font-sans">Analyst Sign In</h2>
          <p className="text-slate-500 text-xs mb-6 leading-relaxed">
            Authentication is required to access metrics and manage dynamic AI agent personas.
          </p>

          {authError && (
            <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-red-700 text-xs mb-4">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
              <input 
                type="email" 
                required
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="hello@logmark-ai.com"
                className="w-full px-3.5 py-2.5 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
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
                className="w-full px-3.5 py-2.5 border border-slate-200 focus:border-slate-400 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-2.5 mt-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition disabled:opacity-55"
            >
              {isLoading ? "Authenticating..." : "Authorize Access"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafb] text-slate-800 font-sans p-6 md:p-12 selection:bg-slate-900 selection:text-white">
      {/* Top Navbar */}
      <div className="flex justify-between items-center mb-12 max-w-6xl mx-auto">
        <div className="flex gap-4 items-center">
          <Link href="/" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Landing
          </Link>
          <span className="text-slate-300">|</span>
          <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-slate-950 transition font-semibold">
            Sign Out
          </button>
        </div>
        <span className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full border border-slate-200 font-semibold uppercase tracking-wider">
          Analyst Console
        </span>
      </div>

      {/* Analytics Dashboard Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {/* MRR Card */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-semibold text-slate-400 uppercase">Monthly Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${monthlyRecurringRevenue}</div>
          <p className="text-[10px] text-slate-400 mt-1">From {activeSubscribers} Premium Subscribers</p>
        </div>

        {/* Total Interactions Card */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-semibold text-slate-400 uppercase">Total Interactions</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalInteractions}</div>
          <p className="text-[10px] text-slate-400 mt-1">Processed Voyage Logs</p>
        </div>

        {/* Operating Costs Card */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-semibold text-slate-400 uppercase">Incurred Cost</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${totalIncurredCost}</div>
          <p className="text-[10px] text-slate-400 mt-1">Gemini (${estimatedGeminiCost}) + SMTP (${estimatedSmtpCost})</p>
        </div>

        {/* Active Accounts Card */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-semibold text-slate-400 uppercase">Registered Officers</span>
            <Users className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalActiveUsers}</div>
          <p className="text-[10px] text-slate-400 mt-1">Total active spaces</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Database Reference details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-6 border border-slate-200">
              <Database className="w-5 h-5 text-slate-700" />
            </div>
            <h3 className="text-base font-bold mb-2 text-slate-900">Knowledge Base</h3>
            <p className="text-slate-500 text-xs leading-relaxed mb-6">
              Upload sea service guides, pricing tables, or merchant navy regulatory sheets. 
              The system will reference this central database to resolve incoming queries.
            </p>
            
            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Indexed Files</span>
                <span className="font-semibold text-slate-800">{kbFiles.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Target Namespace</span>
                <span className="font-mono text-slate-600">/knowledge-base/general</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Upload Management & File List */}
        <div className="lg:col-span-2 space-y-6">
          {statusMsg && (
            <div className="bg-slate-100 border border-slate-200 p-4 rounded-lg text-slate-700 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-slate-600 shrink-0" />
              {statusMsg}
            </div>
          )}

          <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-sans">Reference Documents</h2>
                <p className="text-slate-500 text-xs">Manage reference files accessible by dynamic agent personas.</p>
              </div>

              <div className="flex gap-2 items-center w-full sm:w-auto">
                <select
                  value={selectedAgentForUpload}
                  onChange={(e) => setSelectedAgentForUpload(e.target.value)}
                  className="px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-slate-50 text-slate-800 transition"
                >
                  <option value="global">Global Knowledge</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <div className="relative cursor-pointer shrink-0">
                  <input 
                    type="file" 
                    accept=".pdf,.docx,.doc,.txt,.md" 
                    onChange={handleUploadKB}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <button className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition">
                    <Plus className="w-3.5 h-3.5" /> Upload File
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {kbFiles.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No reference files uploaded yet.
                </div>
              ) : (
                kbFiles.map((file) => (
                  <div key={file.id} className="flex justify-between items-center p-3.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-slate-350 transition">
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-semibold text-slate-800 truncate">{file.name}</div>
                        <div className="text-[10px] text-slate-400">
                          Size: {file.file_size_mb} MB | Scope: <span className="font-semibold text-slate-600">{file.agent_id ? (agents.find(a => a.id === file.agent_id)?.name || 'Linked Agent') : 'Global'}</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(file)}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition shrink-0"
                      title="Remove file"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Agent Management Console */}
      <div className="max-w-6xl mx-auto bg-white border border-slate-200 p-8 rounded-xl shadow-sm mt-8">
        <h2 className="text-lg font-bold text-slate-900 mb-2 font-sans">Specialized Agents Registry</h2>
        <p className="text-slate-500 text-xs mb-6">
          Create and manage specialized agent personas. The router classifies incoming emails using their unique description, then applies their specific prompt and linked files.
        </p>

        <form onSubmit={handleCreateAgent} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 pb-8 border-b border-slate-100">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Agent Name</label>
            <input 
              type="text" 
              required
              value={newAgentName}
              onChange={e => setNewAgentName(e.target.value)}
              placeholder="Sea Service Calculator"
              className="w-full px-3.5 py-2.5 border border-slate-200 focus:border-slate-450 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description (For Classification Routing)</label>
            <input 
              type="text" 
              required
              value={newAgentDesc}
              onChange={e => setNewAgentDesc(e.target.value)}
              placeholder="Handles queries evaluating sea-time records or calculating sea hours."
              className="w-full px-3.5 py-2.5 border border-slate-200 focus:border-slate-450 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">System Prompt Instructions</label>
            <textarea 
              required
              value={newAgentPrompt}
              onChange={e => setNewAgentPrompt(e.target.value)}
              placeholder="You are an expert sea hours calculator. Evaluate and calculate voyage durations..."
              rows={2}
              className="w-full px-3.5 py-2 border border-slate-200 focus:border-slate-450 bg-slate-50 rounded-lg text-xs outline-none text-slate-800 transition resize-none"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition">
              Register Agent Persona
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {agents.map(agent => (
            <div key={agent.id} className="p-6 bg-slate-50 border border-slate-200 rounded-xl relative hover:border-slate-350 transition flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{agent.name}</h4>
                    <span className="text-[9px] font-mono text-slate-400 select-all block mt-0.5">{agent.id}</span>
                  </div>
                  {agent.name !== 'General Maritime Agent' && (
                    <button 
                      onClick={() => handleDeleteAgent(agent.id, agent.name)}
                      className="text-slate-400 hover:text-red-600 transition p-1"
                      title="Delete agent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-650 mb-3 leading-relaxed">
                  <strong>Routing Intent:</strong> {agent.description}
                </p>
                <div className="bg-white border border-slate-200 p-3.5 rounded-lg text-[10px] text-slate-500 font-mono overflow-auto max-h-32 leading-relaxed">
                  {agent.system_prompt}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Activity Logs */}
      <div className="max-w-6xl mx-auto bg-white border border-slate-200 p-8 rounded-xl shadow-sm mt-8">
        <h2 className="text-lg font-bold text-slate-900 mb-2 font-sans">System Activity Logs</h2>
        <p className="text-slate-500 text-xs mb-6">
          Observe real-time operations, invoked agent routing paths, task execution steps, and any transaction failures.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">User Email</th>
                <th className="py-3 px-4">Subject Query</th>
                <th className="py-3 px-4">Invoked Agent</th>
                <th className="py-3 px-4">Execution Status</th>
              </tr>
            </thead>
            <tbody>
              {activityLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    No activity logs registered in the database.
                  </td>
                </tr>
              ) : (
                activityLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(log.created_at).toISOString().replace('T', ' ').substring(0, 19)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {log.profiles?.email || 'System Guest'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 truncate max-w-xs" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="py-3 px-4">
                      {log.agents?.name ? (
                        <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700">
                          {log.agents.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">None / Global</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border text-center ${
                          log.status === 'Completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          log.status === 'Failed' ? 'bg-rose-50 text-rose-800 border-rose-250' :
                          'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          {log.status}
                        </span>
                        {log.error_message && (
                          <span className="text-[10px] text-rose-600 font-mono max-w-xs break-words whitespace-normal block mt-1 leading-normal" title={log.error_message}>
                            Error: {log.error_message}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
