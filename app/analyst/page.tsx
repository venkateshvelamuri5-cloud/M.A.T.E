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

export default function AnalystPortal() {
  const [kbFiles, setKbFiles] = useState<KnowledgeFile[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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

    } catch (err) {
      console.error('Failed to query analyst metrics from Supabase:', err);
      setStatusMsg('Error connecting to Supabase database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsAndFiles();
  }, []);

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

      const { error: dbErr } = await supabase
        .from('user_files')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000',
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

  return (
    <div className="min-h-screen bg-[#fafafb] text-slate-800 font-sans p-6 md:p-12 selection:bg-slate-900 selection:text-white">
      {/* Top Navbar */}
      <div className="flex justify-between items-center mb-12 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Landing
        </Link>
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

    </div>
  );
}
