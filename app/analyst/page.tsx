"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../src/supabase-client';
import { Upload, FileText, Database, Plus, CheckCircle, ArrowLeft, Trash2, TrendingUp, DollarSign, Activity, Users, Lock, LogOut, CheckCircle2, Home, Settings, Shield, AlertCircle, BookOpen, Save, X } from 'lucide-react';

interface KnowledgeFile {
  id: string;
  name: string;
  file_size_mb: number;
  created_at: string;
  storage_path: string;
  agent_id?: string | null;
  file_type?: string;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  slot_code?: string | null;
  instructions?: string | null;
  keywords?: string | null;
  is_locked?: boolean;
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

interface AgentSlot {
  code: string;
  name: string;
  category: string;
  deployed: boolean;
  emailExample: string;
  placeholder1: string;
  placeholder2?: string;
  systemDirective: string;
}

// Default template slots matching the User Dashboard
const AGENT_SLOTS_TEMPLATE: AgentSlot[] = [
  // Category A: ISM Admin Works
  {
    code: 'A1',
    name: 'Risk Assessment',
    category: '(A) ISM Admin Works',
    deployed: true,
    emailExample: "Make RA for 'X-band Radar not working. Pls also include reporting to flag state'",
    placeholder1: "e.g., Working aloft on the main mast to replace signal light bulb.",
    placeholder2: "Include height safety harness requirements and wind speed limits.",
    systemDirective: "Act as the ISM Admin Works A1 Risk Assessment agent. Create a complete risk assessment including hazards, controls, and safety precautions."
  },
  {
    code: 'A2',
    name: 'Audit Closure',
    category: '(A) ISM Admin Works',
    deployed: true,
    emailExample: "Draft CAPA for PSC deficiency on lifeboat engine failing to start instantly.",
    placeholder1: "e.g., Vetting inspector noted oil stain in steering gear flat tray.",
    placeholder2: "Corrective and preventive action details.",
    systemDirective: "Act as the ISM Admin Works A2 Audit Closure agent. Help close out audit findings with root cause, corrective action, and preventive action."
  },
  {
    code: 'A3',
    name: 'Drill Notes',
    category: '(A) ISM Admin Works',
    deployed: true,
    emailExample: "Generate fire drill log for galley fire scenario, crew mustered in 3 mins.",
    placeholder1: "e.g., Abandon ship drill using lifeboat #2, davits checked.",
    placeholder2: "Simulated events and muster times.",
    systemDirective: "Act as the ISM Admin Works A3 Drill Notes agent. Draft a professional emergency drill record for the official logbook."
  },
  {
    code: 'A4',
    name: 'Training Minutes',
    category: '(A) ISM Admin Works',
    deployed: true,
    emailExample: "Create training minutes for cold weather precautions & deck icing.",
    placeholder1: "e.g., Training session on Marpol Annex I oil record book entries.",
    placeholder2: "Main points discussed and feedback.",
    systemDirective: "Act as the ISM Admin Works A4 Training Minutes agent. Draft detailed training minutes for safety meeting logs."
  },

  // Category B: Accounting & Payroll
  {
    code: 'B1',
    name: 'Payroll Calculations',
    category: '(B) Accounting & Payroll',
    deployed: true,
    emailExample: "Calculate overtime wages for deck crew for 45 hours overtime at 1.5x rate.",
    placeholder1: "e.g., Crew wages and overtime calculations for June.",
    placeholder2: "Add details of allotments and cash-drawn advances.",
    systemDirective: "Act as the Accounting & Payroll B1 Payroll Calculations agent. Assist with maritime wage, allotments, and overtime structures."
  },
  {
    code: 'B2',
    name: 'Vessel Accounts (Including Welfare a/c)',
    category: '(B) Accounting & Payroll',
    deployed: true,
    emailExample: "Review vessel port disbursements and cash-to-master balances.",
    placeholder1: "e.g., Port disbursement account reconciliation.",
    placeholder2: "Add welfare account expenses for crew recreation.",
    systemDirective: "Act as the Accounting & Payroll B2 Vessel Accounts agent. Reconcile port expenses, cash to master, and welfare account funds."
  },
  {
    code: 'B3',
    name: 'Bond Accounting',
    category: '(B) Accounting & Payroll',
    deployed: true,
    emailExample: "Generate bond store inventory balance report after crew purchases.",
    placeholder1: "e.g., Slop chest and bonded stores monthly sales reconciliation.",
    placeholder2: "Items: cigarettes, toiletries, snacks.",
    systemDirective: "Act as the Accounting & Payroll B3 Bond Accounting agent. Reconcile slop chest sales, bonded stores inventory, and balances."
  },
  {
    code: 'B4',
    name: 'Victualling Accounting',
    category: '(B) Accounting & Payroll',
    deployed: true,
    emailExample: "Verify catering victualling rate per man-day with 22 crew members onboard.",
    placeholder1: "e.g., Monthly victualling store report and daily provisions cost.",
    placeholder2: "Vessel location and provisioning port.",
    systemDirective: "Act as the Accounting & Payroll B4 Victualling Accounting agent. Calculate victualling provisions, costs per man-day, and consumption levels."
  },

  // Category C: Crew Related
  {
    code: 'C1',
    name: 'Port Papers',
    category: '(C) Crew Related',
    deployed: true,
    emailExample: "Draft crew effects list and port entry immigration requirements.",
    placeholder1: "e.g., Crew list and ports of call declaration for upcoming port entry.",
    placeholder2: "Special custom requirements.",
    systemDirective: "Act as the Crew Related C1 Port Papers agent. Standardize port clearance documentation and crew lists."
  },
  {
    code: 'C2',
    name: 'Crew Certification',
    category: '(C) Crew Related',
    deployed: true,
    emailExample: "Identify STCW endorsements needed for Chief Mate on oil tanker.",
    placeholder1: "e.g., Verification of sea service and medical certificates validity.",
    placeholder2: "Flag state endorsement list.",
    systemDirective: "Act as the Crew Related C2 Crew Certification agent. Check STCW validation, flag state endorsements, and training compliance."
  },
  {
    code: 'C3',
    name: 'SIRE 2.0 Training',
    category: '(C) Crew Related',
    deployed: true,
    emailExample: "Generate training guidelines for SIRE 2.0 vetting inspection questions.",
    placeholder1: "e.g., SIRE 2.0 protocol on deck watch keeping and safety rounds.",
    placeholder2: "Highlight common human factor questions.",
    systemDirective: "Act as the Crew Related C3 SIRE 2.0 Training agent. Provide SIRE 2.0 inspection preparation, question guidelines, and safety check procedures."
  },
  {
    code: 'C4',
    name: '',
    category: '(C) Crew Related',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },

  // Category D: Cargo Related
  {
    code: 'D1',
    name: 'Voyage orders, simplified',
    category: '(D) Cargo Related',
    deployed: true,
    emailExample: "Summarize Charterer voyage instructions for load port draft limits.",
    placeholder1: "e.g., Bunker plan and speed/consumption instructions for crossing.",
    placeholder2: "Vessel routing advice.",
    systemDirective: "Act as the Cargo Related D1 Voyage orders agent. Simplify complex charterer instructions into actionable bridge voyage cards."
  },
  {
    code: 'D2',
    name: 'Cargo calculations',
    category: '(D) Cargo Related',
    deployed: true,
    emailExample: "Estimate cargo loading limit based on load line zones and water density.",
    placeholder1: "e.g., Ullage report, trim correction, and density adjustments.",
    placeholder2: "Temperatures and cargo grades.",
    systemDirective: "Act as the Cargo Related D2 Cargo calculations agent. Provide draft survey calculations, cargo ullage adjustments, and trim correction help."
  },
  {
    code: 'D3',
    name: '',
    category: '(D) Cargo Related',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },
  {
    code: 'D4',
    name: '',
    category: '(D) Cargo Related',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },

  // Category E: Inventories
  {
    code: 'E1',
    name: "Ship's Library",
    category: '(E) Inventories',
    deployed: true,
    emailExample: "Verify inventory of mandatory IMO/SOLAS publications on the bridge.",
    placeholder1: "e.g., Navigation charts correction log and digital publications list.",
    placeholder2: "Next flag state audit check.",
    systemDirective: "Act as the Inventories E1 Ship's Library agent. Assist in tracking navigation library inventory and regulatory requirements."
  },
  {
    code: 'E2',
    name: "Ship's Certificates",
    category: '(E) Inventories',
    deployed: true,
    emailExample: "Flag soon-to-expire safety radio certificate due next month.",
    placeholder1: "e.g., Vessel survey status registry and certificate validity.",
    placeholder2: "Class society names.",
    systemDirective: "Act as the Inventories E2 Ship's Certificates agent. Review statutory certificates registry and alert on surveys."
  },
  {
    code: 'E3',
    name: 'Medicine Chest',
    category: '(E) Inventories',
    deployed: true,
    emailExample: "Perform inventory reconciliation of Category A medicine chest.",
    placeholder1: "e.g., Expired drugs list and emergency medical kit supplies.",
    placeholder2: "WHO guidelines reconciliation.",
    systemDirective: "Act as the Inventories E3 Medicine Chest agent. Reconcile medical stores, first-aid kits, and flag expiry dates."
  },
  {
    code: 'E4',
    name: '',
    category: '(E) Inventories',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },

  // Category F: Misc, Additional
  {
    code: 'F1',
    name: 'SMS Clarification (Using AI)',
    category: '(F) Misc, Additional',
    deployed: true,
    emailExample: "Check SMS guidelines for bunkering operations overside safety.",
    placeholder1: "e.g., Hot work safety checklist and permit to work regulations.",
    placeholder2: "Company policy document name.",
    systemDirective: "Act as the Misc F1 SMS Clarification agent. Guide the user through company Safety Management System (SMS) instructions."
  },
  {
    code: 'F2',
    name: 'Weather Reports',
    category: '(F) Misc, Additional',
    deployed: true,
    emailExample: "Analyze tropical cyclone advisory for routing around Cape of Good Hope.",
    placeholder1: "e.g., Wind and swell routing prediction for North Atlantic crossing.",
    placeholder2: "Swell direction and wave heights.",
    systemDirective: "Act as the Misc F2 Weather Reports agent. Assess route options based on maritime weather routing data."
  },
  {
    code: 'F3',
    name: '',
    category: '(F) Misc, Additional',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },
  {
    code: 'F4',
    name: 'General Maritime AI Query',
    category: '(F) Misc, Additional',
    deployed: true,
    emailExample: "Answer general query on sea service calculation rules.",
    placeholder1: "e.g., General maritime question.",
    placeholder2: "Standard guidelines context.",
    systemDirective: "Act as the General Maritime AI Agent. Provide clear safety and operational guidelines."
  }
];

export default function AnalystPortal() {
  const [kbFiles, setKbFiles] = useState<KnowledgeFile[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // User Manual states
  const [userManualContent, setUserManualContent] = useState('');
  const [userManualEditing, setUserManualEditing] = useState('');
  const [isManualEditMode, setIsManualEditMode] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualSaveMsg, setManualSaveMsg] = useState<string | null>(null);

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
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showLogs, setShowLogs] = useState(false);

  const [filterStatus, setFilterStatus] = useState('All');
  const [filterSlot, setFilterSlot] = useState('All');
  const [filterKeyword, setFilterKeyword] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterSlot, filterKeyword]);

  // Wizard States
  const [selectedSlotCode, setSelectedSlotCode] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  
  // Slot Editor Field States
  const [editIsDeployed, setEditIsDeployed] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editKeywords, setEditKeywords] = useState(''); // Comma-separated routing keywords
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editLinkedFiles, setEditLinkedFiles] = useState<string[]>([]); // Array of fileIds linked to active slot

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
        .select('id, created_at, subject, status, error_message, input_tokens, output_tokens, run_cost, routing_layer, profiles(email), agents(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (logs) {
        setActivityLogs(logs as any[]);
      }

      // Fetch User Manual from system_settings
      const { data: manualData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'user_manual')
        .maybeSingle();
      if (manualData?.value) {
        setUserManualContent(manualData.value);
        setUserManualEditing(manualData.value);
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
      console.error("Analyst auth error:", err);
      const errMsg = err && typeof err === 'object'
        ? (err as any).message || (err as any).error_description || JSON.stringify(err)
        : String(err);
      setAuthError(errMsg);
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
    window.location.href = '/';
  };

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
          agent_id: null
        });

      if (dbErr) throw dbErr;

      setStatusMsg(`Successfully uploaded and indexed "${file.name}" in knowledge base.`);
      fetchAnalyticsAndFiles();

    } catch (err) {
      console.error(err);
      setStatusMsg(`Upload error: ${(err as Error).message}`);
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

  // Save User Manual to system_settings
  const handleSaveUserManual = async () => {
    setIsSavingManual(true);
    setManualSaveMsg(null);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'user_manual', value: userManualEditing }, { onConflict: 'key' });
      if (error) throw error;
      setUserManualContent(userManualEditing);
      setIsManualEditMode(false);
      setManualSaveMsg('User manual saved successfully! Changes are now live for all users.');
      setTimeout(() => setManualSaveMsg(null), 5000);
    } catch (err) {
      console.error(err);
      setManualSaveMsg(`Save failed: ${(err as Error).message}`);
    } finally {
      setIsSavingManual(false);
    }
  };

  // Upload a file as User Manual (reads text content)
  const handleUploadUserManual = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const allowedExts = ['.txt', '.md'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setManualSaveMsg('Please upload a .txt or .md file for the user manual.');
      return;
    }
    setManualSaveMsg('Reading file...');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setUserManualEditing(text);
        setIsManualEditMode(true);
        setManualSaveMsg(`File "${file.name}" loaded. Review below and click Save to publish.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ----------------------------------------------------
  // SLOT CONFIG EDITOR / WIZARD HELPERS
  // ----------------------------------------------------
  const handleOpenSlotEditor = (slotCode: string) => {
    const existing = agents.find(a => a.slot_code === slotCode);
    const template = AGENT_SLOTS_TEMPLATE.find(t => t.code === slotCode);

    setSelectedSlotCode(slotCode);
    setWizardStep(1);

    if (existing) {
      setEditIsDeployed(true);
      setEditName(existing.name);
      setEditDesc(existing.description);
      setEditPrompt(existing.system_prompt);
      setEditInstructions(existing.instructions || '');
      setEditKeywords(existing.keywords || '');
      setEditIsLocked(existing.is_locked || false);
      
      // Load linked files
      const linked = kbFiles.filter(f => f.agent_id === existing.id).map(f => f.id);
      setEditLinkedFiles(linked);
    } else {
      setEditIsDeployed(false);
      setEditName(template?.name || '');
      setEditDesc(template?.placeholder1 || '');
      setEditPrompt(template?.systemDirective || '');
      setEditInstructions(template?.emailExample || '');
      setEditKeywords('');
      setEditIsLocked(false);
      setEditLinkedFiles([]);
    }
  };

  const handleToggleFileLink = (fileId: string) => {
    setEditLinkedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleSaveSlotConfiguration = async () => {
    if (!selectedSlotCode) return;
    setStatusMsg("Saving configurations...");

    try {
      const existing = agents.find(a => a.slot_code === selectedSlotCode);

      if (!editIsDeployed) {
        // If not deployed, delete the agent row if it exists
        if (existing) {
          // Unlink all files first
          await supabase.from('user_files').update({ agent_id: null }).eq('agent_id', existing.id);
          const { error: delErr } = await supabase.from('agents').delete().eq('id', existing.id);
          if (delErr) throw delErr;
        }
        setStatusMsg(`Undeployed slot ${selectedSlotCode} successfully.`);
      } else {
        // Upsert agent
        let agentId = existing?.id;
        const payload = {
          slot_code: selectedSlotCode,
          name: editName,
          description: editDesc,
          system_prompt: editPrompt,
          instructions: editInstructions,
          keywords: editKeywords,
          is_locked: editIsLocked
        };

        if (existing) {
          const { error: updErr } = await supabase.from('agents').update(payload).eq('id', existing.id);
          if (updErr) throw updErr;
        } else {
          const { data: newAgent, error: insErr } = await supabase.from('agents').insert(payload).select().single();
          if (insErr) throw insErr;
          agentId = newAgent.id;
        }

        // Re-link files scope
        if (agentId) {
          // Unlink all files previously bound
          await supabase.from('user_files').update({ agent_id: null }).eq('agent_id', agentId);
          // Link selected files
          if (editLinkedFiles.length > 0) {
            await supabase.from('user_files').update({ agent_id: agentId }).in('id', editLinkedFiles);
          }
        }
        setStatusMsg(`Successfully configured and deployed slot ${selectedSlotCode}!`);
      }

      setSelectedSlotCode(null);
      fetchAnalyticsAndFiles();
    } catch (err) {
      console.error(err);
      setStatusMsg(`Save failed: ${(err as Error).message}`);
    }
  };
  const handleQuickToggleLock = async (e: React.MouseEvent, slotCode: string, isLocked: boolean) => {
    e.stopPropagation();
    const dbAgent = agents.find(a => a.slot_code === slotCode);
    if (!dbAgent) return;
    
    setStatusMsg(`Updating lock status for ${slotCode}...`);
    try {
      const { error } = await supabase
        .from('agents')
        .update({ is_locked: !isLocked })
        .eq('id', dbAgent.id);
      if (error) throw error;
      
      setStatusMsg(`Successfully ${!isLocked ? 'locked' : 'unlocked'} slot ${slotCode}!`);
      fetchAnalyticsAndFiles();
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to toggle lock: ${(err as Error).message}`);
    }
  };

  const handleQuickToggleActive = async (e: React.MouseEvent, slotCode: string, isDeployed: boolean) => {
    e.stopPropagation();
    const dbAgent = agents.find(a => a.slot_code === slotCode);
    
    if (isDeployed && dbAgent) {
      setStatusMsg(`Undeploying slot ${slotCode}...`);
      try {
        await supabase.from('user_files').update({ agent_id: null }).eq('agent_id', dbAgent.id);
        const { error } = await supabase
          .from('agents')
          .delete()
          .eq('id', dbAgent.id);
        if (error) throw error;
        
        setStatusMsg(`Successfully undeployed slot ${slotCode}.`);
        fetchAnalyticsAndFiles();
      } catch (err) {
        console.error(err);
        setStatusMsg(`Failed to undeploy: ${(err as Error).message}`);
      }
    } else {
      const template = AGENT_SLOTS_TEMPLATE.find(t => t.code === slotCode);
      if (!template) return;
      
      setStatusMsg(`Deploying slot ${slotCode} with template defaults...`);
      try {
        const { error } = await supabase
          .from('agents')
          .insert({
            slot_code: slotCode,
            name: template.name,
            description: template.placeholder1,
            system_prompt: template.systemDirective,
            instructions: template.emailExample,
            is_locked: false
          });
        if (error) throw error;
        
        setStatusMsg(`Successfully deployed slot ${slotCode}!`);
        fetchAnalyticsAndFiles();
      } catch (err) {
        console.error(err);
        setStatusMsg(`Failed to deploy: ${(err as Error).message}`);
      }
    }
  };
  // Step Nav validation
  const canGoNext = () => {
    if (wizardStep === 1) return editIsDeployed ? (editName.trim() !== '' && editDesc.trim() !== '') : true;
    if (wizardStep === 2) return editIsDeployed ? (editPrompt.trim() !== '' && editInstructions.trim() !== '') : true;
    return true;
  };

  // ----------------------------------------------------
  // GRID RENDER (Same layout framework as dashboard)
  // ----------------------------------------------------
  const renderCategoryGrid = (categoryName: string) => {
    const slots = AGENT_SLOTS_TEMPLATE.filter(s => s.category === categoryName);
    return (
      <div key={categoryName} className="bg-white border-2 border-[#1b1b1b] rounded-xl overflow-hidden shadow-[3px_3px_0px_0px_#1b1b1b] flex flex-col font-sans">
        <div className="bg-[#1d577a] text-white px-4 py-2.5 font-bold text-xs uppercase tracking-wide">
          {categoryName}
        </div>
        <div className="divide-y divide-[#dcdad5]">
          {slots.map(template => {
            const dbAgent = agents.find(a => a.slot_code === template.code);
            const isDeployed = !!dbAgent;
            const isLocked = dbAgent?.is_locked;

            return (
              <div 
                key={template.code}
                onClick={() => handleOpenSlotEditor(template.code)}
                className="px-4 py-3 text-xs font-bold flex items-center justify-between hover:bg-indigo-50/60 cursor-pointer transition min-h-[42px] text-[#1b1b1b]"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#575ECF]">{template.code}</span>
                  <span>{dbAgent ? dbAgent.name : template.name || '(Empty Slot)'}</span>
                </div>
                <div className="flex items-center gap-3">
                  {isDeployed && (
                    <button 
                      onClick={(e) => handleQuickToggleLock(e, template.code, !!isLocked)}
                      className="p-1 hover:bg-zinc-100 rounded transition shrink-0"
                      title={isLocked ? "Unlock Agent" : "Lock Agent"}
                    >
                      <Lock className={`w-3.5 h-3.5 ${isLocked ? 'text-red-500' : 'text-zinc-400'}`} />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleQuickToggleActive(e, template.code, isDeployed)}
                    className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold border transition ${
                      isDeployed ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100/50' : 'bg-zinc-100 text-zinc-400 border-zinc-250 hover:bg-zinc-200/50'
                    }`}
                    title={isDeployed ? "Click to Deactivate Slot" : "Click to Activate Slot"}
                  >
                    {isDeployed ? 'Active' : 'Empty'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const monthlyRecurringRevenue = activeSubscribers * 29;
  const estimatedGeminiCost = parseFloat((totalInteractions * 0.0005).toFixed(4));
  const estimatedSmtpCost = parseFloat((totalInteractions * 0.0001).toFixed(4));
  const totalIncurredCost = parseFloat((estimatedGeminiCost + estimatedSmtpCost).toFixed(4));

  const filteredLogs = activityLogs.filter(log => {
    if (filterStatus !== 'All' && log.status !== filterStatus) return false;
    if (filterSlot !== 'All') {
      const matchAgent = agents.find(a => a.slot_code === filterSlot);
      if (!matchAgent || log.agents?.name !== matchAgent.name) return false;
    }
    if (filterKeyword.trim() !== '') {
      const search = filterKeyword.toLowerCase();
      const emailMatch = log.profiles?.email?.toLowerCase().includes(search) || false;
      const subjectMatch = log.subject?.toLowerCase().includes(search) || false;
      const errorMatch = log.error_message?.toLowerCase().includes(search) || false;
      if (!emailMatch && !subjectMatch && !errorMatch) return false;
    }
    return true;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const displayedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (!isLoggedIn || !isAnalyst) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6 relative">
        <div className="w-full max-w-sm bg-card border border-border/80 p-8 rounded-xl shadow-md relative">
          <Link href="/" className="absolute top-4 right-4 text-muted-foreground/80 hover:text-foreground transition text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </Link>

          <div className="w-9 h-9 rounded-lg bg-[#575ECF] flex items-center justify-center shadow-sm mb-6">
            <Lock className="w-4.5 h-4.5 text-white" />
          </div>

          <h2 className="text-lg font-black mb-1 text-foreground">Analyst Sign In</h2>
          <p className="text-zinc-550 text-xs mb-6 leading-relaxed font-medium">
            Authentication is required to access analytics metrics and manage dynamic AI agent configurations.
          </p>

          {authError && (
            <div className="bg-red-50 border-2 border-[#FE3F21] p-3.5 rounded-lg text-red-700 text-xs mb-4">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Email Address</label>
              <input 
                type="email" 
                required
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="mate@logmark-ai.com"
                className="w-full px-3.5 py-2.5 border border-border focus:border-[#575ECF] bg-background rounded-lg text-xs outline-none text-foreground transition font-medium"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Password</label>
              <input 
                type="password" 
                required
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border border-border focus:border-[#575ECF] bg-background rounded-lg text-xs outline-none text-foreground transition font-medium"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-3 mt-2 rounded-lg bg-[#575ECF] hover:bg-[#464cb3] text-white font-bold text-xs uppercase tracking-wider transition shadow-sm"
            >
              {isLoading ? "Authenticating..." : "Authorize Access"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const categoriesLeft = ['(A) ISM Admin Works', '(C) Crew Related', '(E) Inventories'];
  const categoriesRight = ['(B) Accounting & Payroll', '(D) Cargo Related', '(F) Misc, Additional'];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12 selection:bg-gold selection:text-deep relative">
      
      {/* Top Navbar */}
      <div className="flex justify-between items-center mb-8 max-w-6xl mx-auto border-b border-border pb-6 relative z-10">
        <div className="flex gap-4 items-center">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition font-bold uppercase tracking-wider">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Landing
          </Link>
          <span className="text-zinc-300">|</span>
          <button onClick={handleLogout} className="text-xs text-zinc-550 hover:text-foreground transition font-bold uppercase tracking-wider">
            Sign Out
          </button>
        </div>
        <span className="text-[9px] bg-card border border-border text-[#575ECF] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider">
          Analyst Console
        </span>
      </div>

      {/* Analytics Dashboard Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 relative z-10">
        <div className="bg-card border border-border/85 p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Monthly Revenue</span>
            <DollarSign className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-foreground">${monthlyRecurringRevenue}</div>
          <p className="text-[10px] text-muted-foreground mt-1 font-medium">From {activeSubscribers} Premium Subscribers</p>
        </div>

        <div className="bg-card border border-border/85 p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Interactions</span>
            <Activity className="w-4.5 h-4.5 text-[#575ECF]" />
          </div>
          <div className="text-2xl font-black text-foreground">{totalInteractions}</div>
          <p className="text-[10px] text-muted-foreground mt-1 font-medium">Processed Voyage Logs</p>
        </div>

        <div className="bg-card border border-border/85 p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Incurred Cost</span>
            <TrendingUp className="w-4.5 h-4.5 text-[#FE7B02]" />
          </div>
          <div className="text-2xl font-black text-foreground">${totalIncurredCost}</div>
          <p className="text-[10px] text-muted-foreground mt-1 font-medium">AI Core (${estimatedGeminiCost}) + SMTP (${estimatedSmtpCost})</p>
        </div>

        <div className="bg-card border border-border/85 p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Registered Officers</span>
            <Users className="w-4.5 h-4.5 text-zinc-600" />
          </div>
          <div className="text-2xl font-black text-foreground">{totalActiveUsers}</div>
          <p className="text-[10px] text-muted-foreground mt-1 font-medium">Total active spaces</p>
        </div>
      </div>

      {statusMsg && (
        <div className="max-w-6xl mx-auto bg-indigo-50 border border-[#575ECF]/40 p-4 rounded-lg text-indigo-800 text-xs flex items-center gap-2 mb-8 relative z-10">
          <CheckCircle2 className="w-4.5 h-4.5 text-[#575ECF] shrink-0 animate-pulse" />
          {statusMsg}
        </div>
      )}

      {/* Slots Category Grid for Analyst Configuration */}
      <div className="max-w-6xl mx-auto bg-card border border-border p-8 rounded-xl shadow-sm mt-8 relative z-10">
        <h2 className="text-lg font-black text-foreground mb-1 font-display">Specialized Agent Configuration Console</h2>
        <p className="text-muted-foreground text-xs mb-6 font-medium">
          Click on any grid slot (A1 - F4) below to configure deployment, write captain-level prompts, associate knowledge files, or lock models.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {categoriesLeft.map(cat => renderCategoryGrid(cat))}
          </div>
          <div className="space-y-6">
            {categoriesRight.map(cat => renderCategoryGrid(cat))}
          </div>
        </div>
      </div>

      {/* Global Knowledge Base Manager */}
      <div className="max-w-6xl mx-auto bg-card border border-border p-8 rounded-xl shadow-sm mt-8 relative z-10 font-sans">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-lg font-black text-foreground font-display">Global Knowledge Base Documents</h2>
            <p className="text-zinc-550 text-xs font-medium mt-1">
              Upload and index statutory reference files, SMS checklists, guidelines, or ship parameters that the AI agents can fetch.
            </p>
          </div>
          <div>
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#575ECF] hover:bg-[#464cb3] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer">
              <Upload className="w-4 h-4" /> Upload Document
              <input 
                type="file" 
                onChange={handleUploadKB} 
                className="hidden" 
                accept=".pdf,.docx,.doc,.txt,.md,.rtf"
              />
            </label>
          </div>
        </div>

        {kbFiles.length === 0 ? (
          <div className="p-8 bg-[#FCFBF8] border border-[#dcdad5] rounded-xl text-center text-zinc-450 italic font-medium">
            No global reference files currently in the knowledge base. Upload documents above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            {kbFiles.map((file) => (
              <div key={file.id} className="p-4 bg-white border-2 border-[#1b1b1b] rounded-xl shadow-[3px_3px_0px_0px_#1b1b1b] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4.5 h-4.5 text-[#575ECF] shrink-0" />
                    <span className="font-bold text-zinc-800 text-xs truncate max-w-[200px]" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-medium">
                    Size: {file.file_size_mb} MB | Mode: {file.file_type === 'knowledge_base' ? 'Global KB' : 'Slot Reference'}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4 border-t border-zinc-100 pt-3">
                  <button 
                    onClick={() => handleDelete(file as any)}
                    className="flex items-center gap-1 text-[10px] text-red-650 hover:text-red-700 font-bold uppercase transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete File
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Activity Logs */}
      <div className="max-w-6xl mx-auto bg-card border border-border/80 p-8 rounded-xl shadow-sm mt-8 relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 className="text-lg font-black text-foreground">System Activity Logs</h2>
            <p className="text-zinc-550 text-xs font-medium">
              Observe real-time operations, invoked agent routing paths, task execution steps, and any transaction failures.
            </p>
          </div>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="px-5 py-2.5 bg-[#1b1b1b] hover:bg-zinc-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition shrink-0"
          >
            {showLogs ? "Hide Logs" : `Show Logs (${activityLogs.length} entries)`}
          </button>
        </div>

        {showLogs && (
          <div className="space-y-4 pt-4 border-t border-zinc-100">
            {/* Live Filter Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[#FCFBF8] border border-[#dcdad5] rounded-xl text-xs font-semibold">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Execution Status</label>
                <select 
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-[#dcdad5] bg-white rounded-lg outline-none text-[#1b1b1b] focus:border-[#575ECF]"
                >
                  <option value="All">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-zinc-555 uppercase tracking-wider mb-1.5">Agent / Slot Code</label>
                <select 
                  value={filterSlot}
                  onChange={e => setFilterSlot(e.target.value)}
                  className="w-full px-3 py-2 border border-[#dcdad5] bg-white rounded-lg outline-none text-[#1b1b1b] focus:border-[#575ECF]"
                >
                  <option value="All">All Agents</option>
                  {AGENT_SLOTS_TEMPLATE.filter(s => s.name !== '').map(s => (
                    <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-555 uppercase tracking-wider mb-1.5">Search Email / Query</label>
                <input 
                  type="text"
                  value={filterKeyword}
                  onChange={e => setFilterKeyword(e.target.value)}
                  placeholder="e.g. vessel@mail.com / radar"
                  className="w-full px-3 py-2 border border-[#dcdad5] bg-white rounded-lg outline-none text-[#1b1b1b] focus:border-[#575ECF]"
                />
              </div>
            </div>

            {/* Logs Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-zinc-450 font-bold uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">User Email</th>
                    <th className="py-3 px-4">Subject Query</th>
                    <th className="py-3 px-4">Invoked Agent</th>
                    <th className="py-3 px-4">Token Metrics &amp; Cost</th>
                    <th className="py-3 px-4">Execution Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-450 italic font-medium">
                        No activity logs match your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    displayedLogs.map((log) => (
                      <tr key={log.id} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition">
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[10px] whitespace-nowrap">
                          {new Date(log.created_at).toISOString().replace('T', ' ').substring(0, 19)}
                        </td>
                        <td className="py-3 px-4 font-bold text-zinc-700">
                          {log.profiles?.email || 'System Guest'}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground truncate max-w-xs" title={log.subject}>
                          {log.subject}
                        </td>
                        <td className="py-3 px-4">
                          {log.agents?.name ? (
                            <span className="px-2 py-1 rounded bg-background border border-border text-[10px] font-bold text-[#575ECF]">
                              {log.agents.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/80 italic font-medium">None / Global</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5 font-mono text-[9px] text-zinc-600 bg-indigo-50/60 p-2 rounded-lg border border-indigo-100 max-w-[130px]">
                            <div className="flex justify-between gap-1">
                              <span>In:</span>
                              <span className="font-bold">{(log as any).input_tokens || 0}</span>
                            </div>
                            <div className="flex justify-between gap-1">
                              <span>Out:</span>
                              <span className="font-bold">{(log as any).output_tokens || 0}</span>
                            </div>
                            <div className="flex justify-between gap-1 border-t border-indigo-200/50 pt-0.5 mt-0.5">
                              <span>Cost:</span>
                              <span className="font-bold text-indigo-700">${(log as any).run_cost ? parseFloat((log as any).run_cost).toFixed(4) : '0.0000'}</span>
                            </div>
                            <div className="text-[8px] text-zinc-400 mt-0.5 border-t border-indigo-200/30 pt-0.5 truncate" title={(log as any).routing_layer || 'N/A'}>
                              Route: {(log as any).routing_layer || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border text-center ${
                              log.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                              log.status === 'Failed' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                              'bg-zinc-100 text-muted-foreground border-border'
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

            {/* Pagination Controls */}
            {filteredLogs.length > itemsPerPage && (
              <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between text-xs">
                <div className="text-zinc-500 font-medium">
                  Showing <span className="font-bold">{Math.min(filteredLogs.length, (currentPage - 1) * itemsPerPage + 1)}</span> to{' '}
                  <span className="font-bold">{Math.min(filteredLogs.length, currentPage * itemsPerPage)}</span> of{' '}
                  <span className="font-bold">{filteredLogs.length}</span> logs (top 100 max)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition text-[#1b1b1b]"
                  >
                    Previous
                  </button>
                  <span className="text-zinc-650 font-bold px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition text-[#1b1b1b]"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Manual Manager Section */}
      <div className="max-w-6xl mx-auto bg-card border border-border p-8 rounded-xl shadow-sm mt-8 relative z-10 font-sans">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-[#575ECF]" />
              <h2 className="text-lg font-black text-foreground font-display">User Manual Management</h2>
            </div>
            <p className="text-zinc-500 text-xs font-medium">
              Edit or replace the user manual displayed to all users. Changes are live immediately.
            </p>
          </div>
          <div className="flex gap-3 shrink-0 flex-wrap">
            {!isManualEditMode ? (
              <button
                onClick={() => { setIsManualEditMode(true); setUserManualEditing(userManualContent); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1b1b1b] hover:bg-zinc-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition"
              >
                Edit Manual
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setIsManualEditMode(false); setUserManualEditing(userManualContent); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-zinc-300 hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs font-bold uppercase tracking-wider transition"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button
                  onClick={handleSaveUserManual}
                  disabled={isSavingManual}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#575ECF] hover:bg-[#464cb3] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" /> {isSavingManual ? 'Saving...' : 'Save & Publish'}
                </button>
              </>
            )}
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer">
              <Upload className="w-4 h-4" /> Upload (.txt/.md)
              <input
                type="file"
                onChange={handleUploadUserManual}
                className="hidden"
                accept=".txt,.md"
              />
            </label>
          </div>
        </div>

        {manualSaveMsg && (
          <div className={`mb-4 p-3 rounded-lg text-xs font-semibold border ${
            manualSaveMsg.includes('failed') || manualSaveMsg.includes('Please')
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            {manualSaveMsg}
          </div>
        )}

        {isManualEditMode ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Editing Manual Content</label>
              <span className="text-[10px] text-zinc-400 font-mono">{userManualEditing.length} chars</span>
            </div>
            <textarea
              value={userManualEditing}
              onChange={e => setUserManualEditing(e.target.value)}
              rows={20}
              className="w-full px-4 py-3 border-2 border-[#575ECF] bg-[#FCFBF8] rounded-xl text-xs outline-none text-[#1b1b1b] font-mono leading-relaxed focus:ring-1 focus:ring-[#575ECF] resize-y"
              placeholder="Enter the user manual content here..."
            />
          </div>
        ) : (
          <div className="bg-[#FCFBF8] border border-[#dcdad5] rounded-xl p-6">
            {userManualContent ? (
              <pre className="text-xs text-[#1b1b1b] font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                {userManualContent}
              </pre>
            ) : (
              <p className="text-zinc-400 text-xs italic text-center py-6">
                No user manual published yet. Click "Edit Manual" to add content or upload a .txt/.md file.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Selected Slot Setup Wizard Modal */}
      {selectedSlotCode && (
        <div className="fixed inset-0 bg-[#1b1b1b]/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="w-full max-w-xl bg-card border-2 border-[#1b1b1b] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="bg-[#FAF9F6] border-b border-[#dcdad5] px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-display font-black text-sm text-deep">
                  Configuration Wizard: Slot {selectedSlotCode}
                </h3>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#575ECF]">
                  Step {wizardStep} of 4
                </span>
              </div>
              <button 
                onClick={() => setSelectedSlotCode(null)}
                className="text-[10px] text-zinc-550 border border-[#dcdad5] px-3 py-1.5 rounded-lg hover:bg-secondary font-bold uppercase transition"
              >
                Cancel
              </button>
            </div>

            {/* Modal Content Steps */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h4 className="font-bold underline text-zinc-650 mb-2">Step 1: Deployment & Metadata</h4>
                  
                  <div className="flex items-center gap-3 p-3 bg-indigo-50/50 border border-[#575ECF]/20 rounded-lg">
                    <input 
                      type="checkbox"
                      id="isDeployedCheck"
                      checked={editIsDeployed}
                      onChange={e => setEditIsDeployed(e.target.checked)}
                      className="w-4 h-4 text-[#575ECF] rounded border-[#dcdad5] focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="isDeployedCheck" className="font-bold text-zinc-700 cursor-pointer select-none">
                      Active Deployment Status
                    </label>
                  </div>

                  {editIsDeployed && (
                    <>
                      <div>
                        <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Agent Model Name</label>
                        <input 
                          type="text"
                          required
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="e.g., A1 Risk Assessment"
                          className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] rounded-lg text-xs outline-none bg-background text-[#1b1b1b] font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Model Description</label>
                        <textarea 
                          required
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          placeholder="Routing intent or classification guidelines."
                          rows={3}
                          className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] rounded-lg text-xs outline-none bg-background text-[#1b1b1b] font-medium"
                        />
                      </div>
                    </>
                  )}
                  {!editIsDeployed && (
                    <div className="p-4 bg-zinc-50 text-zinc-500 rounded-lg text-center font-medium italic border border-zinc-200">
                      Unchecking this will remove this agent from the user dashboard.
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h4 className="font-bold underline text-zinc-650 mb-2">Step 2: Core Directives & Prompts</h4>
                  
                  {!editIsDeployed ? (
                    <div className="p-4 bg-zinc-50 text-zinc-500 rounded-lg text-center font-medium italic">
                      Model is not deployed. Toggle "Active" in Step 1 to write prompts.
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Captain System Prompt Directive</label>
                        <textarea 
                          required
                          value={editPrompt}
                          onChange={e => setEditPrompt(e.target.value)}
                          rows={6}
                          placeholder="Keep the hat of a Captain. You are safety-first..."
                          className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] rounded-lg text-xs outline-none bg-background text-[#1b1b1b] font-mono leading-relaxed"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Instructions & Email Templates</label>
                        <textarea 
                          required
                          value={editInstructions}
                          onChange={e => setEditInstructions(e.target.value)}
                          rows={3}
                          placeholder="e.g. For sending query via email; 'Make RA for...'"
                          className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] rounded-lg text-xs outline-none bg-background text-[#1b1b1b] font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Email Routing Keywords
                        </label>
                        <input
                          type="text"
                          value={editKeywords}
                          onChange={e => setEditKeywords(e.target.value)}
                          placeholder="e.g. Risk Assessment, RA, Safety Assessment, Risk Analysis, risk assesment"
                          className="w-full px-3 py-2 border border-[#dcdad5] focus:border-[#575ECF] rounded-lg text-xs outline-none bg-background text-[#1b1b1b] font-medium"
                        />
                        <p className="text-[10px] text-zinc-400 mt-1.5 italic">
                          Comma-separated. When an email contains these words (exact or fuzzy match), it will be automatically routed to this agent — no AI guessing. Include common typos and abbreviations (e.g. "RA", "risk assesment").
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h4 className="font-bold underline text-zinc-650 mb-2">Step 3: Associate Knowledge Bases</h4>
                  
                  {!editIsDeployed ? (
                    <div className="p-4 bg-zinc-50 text-zinc-500 rounded-lg text-center font-medium italic">
                      Model is not deployed.
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] text-zinc-550 font-medium">
                        Associate specific reference documents with this agent. Grounding query calls will restrict context lookups to these files.
                      </p>
                      
                      {/* Direct Upload inside Wizard */}
                      <div className="p-3.5 bg-[#FCFBF8] border border-[#dcdad5] rounded-xl space-y-2">
                        <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                          Upload New Reference Document
                        </label>
                        <div className="relative cursor-pointer w-full">
                          <input 
                            type="file" 
                            accept=".pdf,.docx,.doc,.txt,.md,.rtf" 
                            onChange={async (e) => {
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

                                // Find or establish active agent ID
                                let agentId = agents.find(a => a.slot_code === selectedSlotCode)?.id;
                                if (!agentId) {
                                  // Create agent record immediately to get an ID for linking
                                  const { data: newAgent, error: insErr } = await supabase.from('agents').insert({
                                    slot_code: selectedSlotCode,
                                    name: editName,
                                    description: editDesc,
                                    system_prompt: editPrompt,
                                    instructions: editInstructions,
                                    is_locked: editIsLocked
                                  }).select().single();
                                  if (insErr) throw insErr;
                                  agentId = newAgent.id;
                                  // Refresh agent list in local state
                                  const { data: updatedAgents } = await supabase.from('agents').select('*');
                                  if (updatedAgents) setAgents(updatedAgents);
                                }

                                const { data: fileData, error: dbErr } = await supabase
                                  .from('user_files')
                                  .insert({
                                    user_id: currentUserId,
                                    name: file.name,
                                    storage_path: storagePath,
                                    file_type: 'knowledge_base',
                                    file_size_mb: fileSizeMB,
                                    agent_id: agentId
                                  })
                                  .select()
                                  .single();

                                if (dbErr) throw dbErr;

                                setStatusMsg(`Successfully uploaded "${file.name}"!`);
                                // Append file details to local selection and refresh indexed docs
                                setEditLinkedFiles(prev => [...prev, fileData.id]);
                                fetchAnalyticsAndFiles();
                              } catch (err) {
                                console.error(err);
                                setStatusMsg(`Upload failed: ${(err as Error).message}`);
                              }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                          />
                          <div className="px-4 py-2.5 border-2 border-dashed border-[#dcdad5] hover:bg-zinc-50 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition text-zinc-650">
                            <Plus className="w-4 h-4 text-[#575ECF]" /> Click to upload PDF, TXT, DOCX, MD
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
                        {kbFiles.length === 0 ? (
                          <div className="text-zinc-400 italic text-center py-4">No reference files available. Upload files above.</div>
                        ) : (
                          kbFiles.map(file => (
                            <label key={file.id} className="flex items-center justify-between p-2.5 bg-[#FCFBF8] border border-[#dcdad5] rounded-lg cursor-pointer select-none">
                              <div className="flex items-center gap-2">
                                <input 
                                  type="checkbox"
                                  checked={editLinkedFiles.includes(file.id)}
                                  onChange={() => handleToggleFileLink(file.id)}
                                  className="w-3.5 h-3.5 text-[#575ECF] rounded border-[#dcdad5] cursor-pointer"
                                />
                                <span className="font-semibold text-zinc-700 truncate max-w-xs">{file.name}</span>
                              </div>
                              <span className="text-[8px] uppercase tracking-wider font-bold bg-zinc-200 text-zinc-500 px-1 py-0.5 rounded">
                                {file.agent_id ? 'Linked' : 'Global'}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-4">
                  <h4 className="font-bold underline text-zinc-650 mb-2">Step 4: Control & Security</h4>
                  
                  {!editIsDeployed ? (
                    <div className="p-4 bg-zinc-50 text-zinc-500 rounded-lg text-center font-medium italic">
                      Model is not deployed.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 p-3 bg-red-50/50 border border-red-200 rounded-lg">
                        <input 
                          type="checkbox"
                          id="isLockedCheck"
                          checked={editIsLocked}
                          onChange={e => setEditIsLocked(e.target.checked)}
                          className="w-4 h-4 text-red-600 rounded border-red-300 focus:ring-0 cursor-pointer"
                        />
                        <label htmlFor="isLockedCheck" className="font-bold text-red-750 cursor-pointer select-none">
                          Lock Agent Model (Disable User Dashboard access)
                        </label>
                      </div>

                      <p className="text-[11px] text-zinc-500 leading-normal">
                        Locking an agent model will keep it saved in the database but renders it non-clickable with a lock icon on the User Dashboard page. This prevents officers from executing tasks while you are modifying directives.
                      </p>
                    </>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            <div className="bg-[#FAF9F6] border-t border-[#dcdad5] px-6 py-4 flex justify-between items-center">
              <div>
                {wizardStep > 1 && (
                  <button 
                    onClick={() => setWizardStep(prev => prev - 1)}
                    className="px-4 py-2 border border-[#dcdad5] hover:bg-secondary rounded-lg font-bold text-[10px] uppercase tracking-wider transition"
                  >
                    Back
                  </button>
                )}
              </div>
              
              <div className="flex gap-2">
                {wizardStep < 4 ? (
                  <button 
                    onClick={() => {
                      if (canGoNext()) setWizardStep(prev => prev + 1);
                    }}
                    disabled={!canGoNext()}
                    className="px-5 py-2 bg-[#1b1b1b] text-white hover:bg-zinc-800 rounded-lg font-bold text-[10px] uppercase tracking-wider transition disabled:opacity-50"
                  >
                    Next
                  </button>
                ) : (
                  <button 
                    onClick={handleSaveSlotConfiguration}
                    className="px-5 py-2 bg-[#575ECF] text-white hover:bg-[#464cb3] rounded-lg font-bold text-[10px] uppercase tracking-wider transition"
                  >
                    Save Configuration
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
