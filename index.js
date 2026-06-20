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
}

export default function AnalystPortal() {
  const [kbFiles, setKbFiles] = useState<KnowledgeFile[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Business Analytics states
  const [totalActiveUsers, setTotalActiveUsers] = useState(0);
  const [activeSubscribers, setActiveSubscribers] = useState(0);
  const [totalInteractions, setTotalInteractions] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Check if Supabase variables are set. If not, auto-enable local demo mode
  useEffect(() => {
    const isPlaceholder = 
      process.env.NEXT_PUBLIC_SUPABASE_URL === undefined &&
      (supabase as any).supabaseUrl?.includes('placeholder-project');
    
    if (isPlaceholder) {
      setIsDemoMode(true);
      setKbFiles([
        { id: '1', name: 'merchant-navy-pricing-2026.docx', file_size_mb: 0.12, created_at: new Date().toISOString(), storage_path: 'mock' },
        { id: '2', name: 'sea-service-regulations-2026.pdf', file_size_mb: 1.45, created_at: new Date().toISOString(), storage_path: 'mock' }
      ]);
      setTotalActiveUsers(48);
      setActiveSubscribers(6);
      setTotalInteractions(340);
      setStatusMsg("M.A.T.E is running in Local Offline Demo Mode. (No Supabase config found)");
    } else {
      fetchAnalyticsAndFiles();
    }
  }, []);

  // Fetch real analytics parameters from Supabase tables
  const fetchAnalyticsAndFiles = async () => {
    if (isDemoMode) return;
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
        .eq('file_type', 'knowledge_base');
      if (files) {
        setKbFiles(files);
      }

    } catch (err) {
      console.error('Failed to query analyst metrics from Supabase:', err);
      setStatusMsg('Error connecting to Supabase database.');
    } finally {
      setIsLoading(false);
    }
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

    if (isDemoMode) {
      const newFile: KnowledgeFile = {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        file_size_mb: fileSizeMB,
        created_at: new Date().toISOString(),
        storage_path: 'mock'
      };
      setKbFiles(prev => [...prev, newFile]);
      setStatusMsg(`Offline Simulation: Uploaded reference document "${file.name}"`);
      return;
    }

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
          file_size_mb: fileSizeMB
        });

      if (dbErr) throw dbErr;

      setStatusMsg(`Successfully uploaded and indexed "${file.name}" in general knowledge base.`);
      fetchAnalyticsAndFiles();

    } catch (err) {
      console.error(err);
      setStatusMsg(`Upload error: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (file: KnowledgeFile) => {
    if (isDemoMode) {
      setKbFiles(kbFiles.filter(f => f.id !== file.id));
      setStatusMsg(`Offline Simulation: Deleted reference document ${file.name}`);
      return;
    }

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
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Reference Documents</h2>
                <p className="text-slate-500 text-xs">Manage general files accessible by the validation engine.</p>
              </div>

              <div className="relative cursor-pointer">
                <input 
                  type="file" 
                  accept=".pdf,.docx,.txt" 
                  onChange={handleUploadKB}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <button className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition">
                  <Plus className="w-3.5 h-3.5" /> Upload File
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {kbFiles.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No general reference files uploaded.
                </div>
              ) : (
                kbFiles.map((file) => (
                  <div key={file.id} className="flex justify-between items-center p-3.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-slate-300 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
                        <FileText className="w-4 h-4 text-slate-500" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-800">{file.name}</div>
                        <div className="text-[10px] text-slate-400">
                          Size: {file.file_size_mb} MB | Uploaded: {new Date(file.created_at).toISOString().split('T')[0]}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(file)}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition"
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
    </div>
  );
}
