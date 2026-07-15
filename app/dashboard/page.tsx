"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/supabase-client';
import { Upload, Mail, CreditCard, Shield, AlertCircle, CheckCircle2, Anchor, LogIn, UserPlus, LogOut, FileText, History, ArrowLeft, Download, Clipboard, Server, Settings, ChevronRight, Home, Lock, BookOpen, X } from 'lucide-react';

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
  system_prompt: string;
  slot_code?: string | null;
  instructions?: string | null;
  is_locked?: boolean;
}

interface AgentTemplate {
  id: string;
  agent_id: string;
  task_name: string;
  description: string;
  template_body: string;
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

const AGENT_SLOTS: AgentSlot[] = [
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
  const [originalVesselEmail, setOriginalVesselEmail] = useState('');
  const [vesselEmailLastChanged, setVesselEmailLastChanged] = useState<string | null>(null);
  const [userRole, setUserRole] = useState('user');

  // Expanded vessel details states
  const [vesselNameInput, setVesselNameInput] = useState('');
  const [vesselTypeInput, setVesselTypeInput] = useState('');
  const [operatorNameInput, setOperatorNameInput] = useState('');
  const [grtInput, setGrtInput] = useState('');

  // Pump room & systems states
  const [hasPumpRoom, setHasPumpRoom] = useState(true);
  const [pumpSystemType, setPumpSystemType] = useState('N/A');

  // Bow thruster & cargo
  const [hasBowThruster, setHasBowThruster] = useState(false);
  const [carriesChemicalCargo, setCarriesChemicalCargo] = useState(false);

  // EGCS (Scrubber)
  const [hasEgcs, setHasEgcs] = useState(false);
  const [egcsType, setEgcsType] = useState('N/A');

  // Operating regions
  const [operatesUsWaters, setOperatesUsWaters] = useState(false);
  const [operatesAusNzWaters, setOperatesAusNzWaters] = useState(false);
  const [operatesEuWaters, setOperatesEuWaters] = useState(false);
  const [operatesChineseWaters, setOperatesChineseWaters] = useState(false);

  // Interactive help modal toggles
  const [showWorkflowHelp, setShowWorkflowHelp] = useState(false);
  const [showWebUiHelp, setShowWebUiHelp] = useState(false);
  const [showEmailHelp, setShowEmailHelp] = useState(false);


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
  const [selectedAgentSlot, setSelectedAgentSlot] = useState<AgentSlot | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [elementsToInclude, setElementsToInclude] = useState('');
  const [userFeedback, setUserFeedback] = useState('');
  const [feedbackStatusMsg, setFeedbackStatusMsg] = useState<string | null>(null);
  const [webRunAgentId, setWebRunAgentId] = useState('');
  const [webRunQueryInput, setWebRunQueryInput] = useState('');
  const [webRunSelectedFiles, setWebRunSelectedFiles] = useState<string[]>([]);
  const [isWebRunning, setIsWebRunning] = useState(false);
  const [webRunResult, setWebRunResult] = useState<string | null>(null);

  // Email and Download Toggles
  const [sendEmailToggle, setSendEmailToggle] = useState(false);

  // User Manual states
  const [showUserManual, setShowUserManual] = useState(false);
  const [userManualContent, setUserManualContent] = useState<string | null>(null);

  // Dynamic Slot Mapping for Analyst Deployed Agents
  const [dynamicSlots, setDynamicSlots] = useState<AgentSlot[]>(AGENT_SLOTS);

  useEffect(() => {
    if (agents.length === 0) return;

    // Clone template slots and update with DB configurations
    const updatedSlots = AGENT_SLOTS.map(slot => {
      const dbAgent = agents.find(a => (a as any).slot_code === slot.code);
      if (dbAgent) {
        return {
          ...slot,
          name: dbAgent.name,
          deployed: true,
          systemDirective: dbAgent.system_prompt,
          emailExample: dbAgent.instructions || slot.emailExample,
          is_locked: (dbAgent as any).is_locked || false,
          customDbId: dbAgent.id
        };
      }
      return { ...slot, deployed: false, is_locked: false };
    });

    // Check for custom agents that don't match core template codes
    const templateCodes = AGENT_SLOTS.map(s => s.code);
    const customAgents = agents.filter(a => 
      (a as any).slot_code && !templateCodes.includes((a as any).slot_code)
    );

    const emptySlots = updatedSlots.filter(s => !s.deployed);

    customAgents.forEach((agent, index) => {
      if (index < emptySlots.length) {
        const targetSlot = emptySlots[index];
        targetSlot.name = agent.name;
        targetSlot.deployed = true;
        targetSlot.emailExample = agent.instructions || `Send task to: ${agent.name}`;
        targetSlot.placeholder1 = "e.g., Enter your specific request for this custom agent.";
        targetSlot.systemDirective = agent.system_prompt;
        (targetSlot as any).customDbId = agent.id;
        (targetSlot as any).is_locked = (agent as any).is_locked || false;
      } else {
        const nextIndex = index - emptySlots.length + 5;
        updatedSlots.push({
          code: `F${nextIndex}`,
          name: agent.name,
          category: '(F) Misc, Additional',
          deployed: true,
          emailExample: agent.instructions || `Send task to: ${agent.name}`,
          placeholder1: "e.g., Enter your specific request for this custom agent.",
          systemDirective: agent.system_prompt,
          customDbId: agent.id,
          is_locked: (agent as any).is_locked || false
        } as any);
      }
    });

    setDynamicSlots(updatedSlots);
  }, [agents]);

  const handleToggleFileSelection = (fileId: string) => {
    setWebRunSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const getDatabaseAgentId = (slotCode: string) => {
    if (slotCode === 'F4') {
      const generalAgent = agents.find(a => a.name.toLowerCase().includes('general'));
      return generalAgent ? generalAgent.id : (agents[0]?.id || '');
    } else {
      const mateAgent = agents.find(a => a.name.toLowerCase().includes('m.a.t.e') || a.name.toLowerCase().includes('compliance'));
      return mateAgent ? mateAgent.id : (agents[0]?.id || '');
    }
  };

  const handleWebRunSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !selectedAgentSlot || !webRunQueryInput) {
      setStatusMsg("Please enter a task description.");
      return;
    }

    setIsWebRunning(true);
    setStatusMsg("Running AI agent, validating workspace files...");
    setWebRunResult(null);

    const dbAgentId = (selectedAgentSlot as any).customDbId || getDatabaseAgentId(selectedAgentSlot.code);
    if (!dbAgentId) {
      setIsWebRunning(false);
      setStatusMsg("Error: Agent profile not found in database.");
      return;
    }

    const queryToSend = `[Agent Category: ${selectedAgentSlot.category}]\n[Role: ${selectedAgentSlot.code} - ${selectedAgentSlot.name}]\n[Instructions: ${selectedAgentSlot.systemDirective}]\n\nRequirement:\n${webRunQueryInput}` +
      (elementsToInclude ? `\n\nAdditional elements to include:\n${elementsToInclude}` : '');

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          agentId: dbAgentId,
          queryInput: queryToSend,
          selectedFileIds: webRunSelectedFiles,
          sendEmail: sendEmailToggle
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server error running agent');
      }

      setWebRunResult(data.result);
      setStatusMsg("Agent finished successfully! Response generated.");
      fetchUserData(userId, emailInput);

      // Auto download if toggle is enabled
      if (sendEmailToggle) {
        const blob = new Blob([data.result], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${selectedAgentSlot.code}_${selectedAgentSlot.name.replace(/\s+/g, '_')}_response.txt`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err) {
      console.error(err);
      setStatusMsg(`Execution failed: ${(err as Error).message}`);
    } finally {
      setIsWebRunning(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFeedback || !userId || !selectedAgentSlot) return;
    setFeedbackStatusMsg("Sending feedback...");
    try {
      const { error } = await supabase.from('interactions_log').insert({
        user_id: userId,
        subject: `Feedback on ${selectedAgentSlot.code} - ${selectedAgentSlot.name}`,
        status: 'Completed',
        error_message: `User Feedback: ${userFeedback}`
      });
      if (error) throw error;

      // Fire feedback email notification — non-blocking
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          feedback: userFeedback,
          agentCode: selectedAgentSlot.code,
          agentName: selectedAgentSlot.name
        })
      }).catch(err => console.warn('Feedback email failed (non-critical):', err));

      setFeedbackStatusMsg("Thank you for your feedback!");
      setUserFeedback('');
      setTimeout(() => setFeedbackStatusMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setFeedbackStatusMsg("Failed to submit feedback.");
    }
  };

  const handleCopyResult = () => {
    if (webRunResult) {
      navigator.clipboard.writeText(webRunResult);
      setStatusMsg("Copied response to clipboard!");
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const handleDownloadResult = () => {
    if (webRunResult && selectedAgentSlot) {
      const blob = new Blob([webRunResult], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedAgentSlot.code}_${selectedAgentSlot.name.replace(/\s+/g, '_')}_response.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  const handleRunFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !userId) return;
    const file = e.target.files[0];
    const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      setStatusMsg('Upload failed. Only PDF, DOCX, DOC, TXT, MD, and RTF files are allowed.');
      return;
    }
    setStatusMsg('Uploading reference document to your workspace...');
    try {
      const storagePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('user-spaces')
        .upload(storagePath, file);
      if (uploadErr) throw uploadErr;
      const { data: dbRow, error: dbErr } = await supabase
        .from('user_files')
        .insert({
          user_id: userId,
          name: file.name,
          storage_path: storagePath,
          file_type: fileExtension.substring(1),
          file_size_mb: fileSizeMB
        })
        .select()
        .single();
      if (dbErr) throw dbErr;
      setStatusMsg(`"${file.name}" uploaded and selected for this run.`);
      if (dbRow?.id) {
        setWebRunSelectedFiles(prev => [...prev, dbRow.id]);
      }
      fetchUserData(userId, emailInput);
    } catch (err) {
      setStatusMsg(`Upload error: ${(err as Error).message}`);
    }
    e.target.value = '';
  };

  const STORAGE_LIMIT_MB = 25;

  // Track storage calculation
  const totalSpaceUsedMB = parseFloat(
    uploadedFiles.reduce((acc, file) => acc + Number(file.file_size_mb), 0).toFixed(2)
  );

  // Fetch User Manual from system_settings
  const fetchUserManual = async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'user_manual')
        .maybeSingle();
      if (data?.value) {
        setUserManualContent(data.value);
      }
    } catch (err) {
      console.warn('Could not fetch user manual:', err);
    }
  };

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
          fetchUserManual();
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
          setVesselNameInput(profile.vessel_name || '');
          setVesselTypeInput(profile.vessel_type || '');
          setOperatorNameInput(profile.operator_name || '');
          setGrtInput(profile.grt || '');
          setHasPumpRoom(profile.has_pump_room !== false);
          setPumpSystemType(profile.pump_system_type || 'N/A');
          setHasBowThruster(!!profile.has_bow_thruster);
          setCarriesChemicalCargo(!!profile.carries_chemical_cargo);
          setHasEgcs(!!profile.has_egcs);
          setEgcsType(profile.egcs_type || 'N/A');
          setOperatesUsWaters(!!profile.operates_us_waters);
          setOperatesAusNzWaters(!!profile.operates_aus_nz_waters);
          setOperatesEuWaters(!!profile.operates_eu_waters);
          setOperatesChineseWaters(!!profile.operates_chinese_waters);
        }
      }

      if (profile) {
        setSubscriptionPlan(profile.subscription_plan);
        setOriginalVesselEmail(profile.vessel_email || '');
        setVesselEmailLastChanged(profile.vessel_email_last_changed || null);
        setUserRole(profile.role || 'user');
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

      // 3. Fetch Uploaded Files List (both user workspace and Global KB files)
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
      const isEmailChanged = vesselEmailInput.trim() !== originalVesselEmail.trim();
      const nowString = new Date().toISOString();

      if (isEmailChanged) {
        // Enforce 15 days limit check
        if (vesselEmailLastChanged) {
          const lastChangedTime = new Date(vesselEmailLastChanged).getTime();
          const diffMs = Date.now() - lastChangedTime;
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays < 15) {
            const daysRemaining = Math.ceil(15 - diffDays);
            setStatusMsg(`Error: You can only change your Interaction Email once every 15 days. Next change allowed in ${daysRemaining} day(s).`);
            return;
          }
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullNameInput || null,
          company_name: companyInput || null,
          rank: rankInput || null,
          vessel_email: vesselEmailInput || null,
          vessel_email_last_changed: isEmailChanged ? nowString : vesselEmailLastChanged,
          vessel_name: vesselNameInput || null,
          vessel_type: vesselTypeInput || null,
          operator_name: operatorNameInput || null,
          grt: grtInput || null,
          has_pump_room: hasPumpRoom,
          pump_system_type: hasPumpRoom ? 'N/A' : pumpSystemType,
          has_bow_thruster: hasBowThruster,
          carries_chemical_cargo: carriesChemicalCargo,
          has_egcs: hasEgcs,
          egcs_type: hasEgcs ? egcsType : 'N/A',
          operates_us_waters: operatesUsWaters,
          operates_aus_nz_waters: operatesAusNzWaters,
          operates_eu_waters: operatesEuWaters,
          operates_chinese_waters: operatesChineseWaters
        })
        .eq('id', userId);

      if (error) throw error;
      
      if (isEmailChanged) {
        setOriginalVesselEmail(vesselEmailInput);
        setVesselEmailLastChanged(nowString);
      }

      setStatusMsg("Workspace settings updated successfully.");
      setIsSettingsOpen(false);
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
    window.location.href = '/';
  };

  // Real Upload Handler supporting .pdf, .docx, .txt, .md
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId || !e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));
    
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      setStatusMsg(`Upload failed. Only PDF, DOCX, DOC, TXT, MD, and RTF files are allowed.`);
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

  const handleDeleteFile = async (file: UploadedFile) => {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
    setStatusMsg(`Deleting "${file.name}"...`);
    try {
      // 1. Delete from Supabase Storage
      const { error: storageErr } = await supabase.storage
        .from('user-spaces')
        .remove([file.storage_path]);
      if (storageErr) {
        console.warn("Storage deletion warning:", storageErr.message);
      }

      // 2. Delete from database table user_files
      const { error: dbErr } = await supabase
        .from('user_files')
        .delete()
        .eq('id', file.id);

      if (dbErr) throw dbErr;

      setStatusMsg(`File "${file.name}" deleted successfully.`);
      setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
      
      setTimeout(() => {
        setStatusMsg(null);
      }, 4000);
    } catch (err) {
      console.error("Delete failed:", err);
      setStatusMsg(`Delete failed: ${(err as Error).message}`);
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

  // Render Category Block
  const renderCategoryCard = (categoryName: string) => {
    const slots = dynamicSlots.filter(s => s.category === categoryName && s.name);
    if (slots.length === 0) return null;
    return (
      <div key={categoryName} className="bg-white border-2 border-[#1b1b1b] rounded-xl overflow-hidden shadow-[3px_3px_0px_0px_#1b1b1b] flex flex-col">
        <div className="bg-[#1d577a] text-white px-4 py-2.5 font-bold text-xs tracking-wide uppercase">
          {categoryName}
        </div>
        <div className="divide-y divide-[#dcdad5]">
          {slots.map(slot => (
            <div 
              key={slot.code} 
              onClick={() => {
                if (slot.deployed && !(slot as any).is_locked) {
                  router.push(`/dashboard/modules/${slot.code}`);
                }
              }}
              className={`px-4 py-3 text-xs font-bold flex items-center justify-between transition min-h-[42px] ${
                slot.deployed && !(slot as any).is_locked
                  ? 'hover:bg-indigo-50/60 cursor-pointer text-[#1b1b1b]' 
                  : 'text-zinc-400 bg-zinc-50/50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-bold text-[#575ECF]">{slot.code}</span>
                <span>{slot.name}</span>
              </div>
              
              {!slot.deployed ? (
                <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 uppercase tracking-wide">
                  Work in Progress
                </span>
              ) : (slot as any).is_locked ? (
                <Lock className="w-3.5 h-3.5 text-red-500 shrink-0 animate-pulse" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // VIEW 1: AGENT INTERACTIVE PORTAL (Image 2)
  // ----------------------------------------------------

  const DEFAULT_USER_MANUAL = `M.A.T.E User Manual\n\n(for email Query)\n\nModules Available\n(A) ISM ADMIN WORKS\nA1 - Risk Assessment\nA2 - Audit Closure (work in progress)\nA3 - Drill Notes (work in progress)\nA4 - Training Minutes (work in progress)\n\n(B) ACCOUNTING & PAYROLL\nB1 - Payroll Calculation (work in progress)\nB2 - Vessel Accounts (Including Welfare a/c) (work in progress)\nB3 - Bond Accounting (work in progress)\nB4 - Victualling Accounting (work in progress)\n\n(C) CREW RELATED\nC1 - Port Papers (work in progress)\nC2 - Crew Certification (work in progress)\nC3 - \nC4 - \n\n(D) CARGO RELATED (Tankers)\nD1 - Voyage Orders, Simplified (work in progress)\nD2 - Cargo Calculations (work in progress)\nD3 - \nD4 - \n\n(E) INVENTORIES\nE1 - Ship's Library (work in progress)\nE2 - Ship's Certificates (work in progress)\nE3 - Medicine Chest (work in progress)\nE4 - Narcotics List (work in progress)\n\n(F) MISC, ADDITIONAL\nF1 - SMS Clarification (Using AI)\nF2 - Weather Reports\nF3 - SIRE 2.0\nF4 - General Maritime AI Query\n\n(A1) RISK ASSESSMENT\n\nThe email sent out can be formatted or plain text. Plain text option is preferred to minimize the outbound email data packet size.\n\n----------------------------------------------------\nHOW TO :-\nTO : mate@logmark-ai.com\nSUBJECT : Enter the name of the module you want to query. Please ensure that you use one of the following: "RA", "RISK ASSESSMENT", "SAFETY ASSESSMENT", or "RISK ANALYSIS". Please note that the MATE 'may not' reliably process or recognize keywords outside of this list.\nBODY : Insert a one liner query to the risk assessment module.\n\nIn a separate paragraph, spaced by a line, put in list of items you want the AI to mandatorily include in your risk assessment output.\n\nATTACHMENT : Any PDF relevant to the RA being generated can be added as an attachment; example - mail from office requiring points to be included in RA, extract of company manual or any other document that as relevant information that you want included in the risk assessment generated.\n\nNote that; additional text after the RA request and attachment addition are optional.\n\n!! Greater the detail mentioned in the requirement, the better will the output"\nFor example :- A query "Make RA for 'midship crane not operating prior coming to port'" will give a poor result compared to 'Midship crane non-operational as required by terminal requirement prior vessel coming into terminal for loading operation'\n----------------------------------------------------\n\n----------------------------------------------------\nEXAMPLE :-\nTO : mate@logmark-ai.com\n\nSUBJECT : Risk Assessment\n\nBODY : \nMake a RA for X-band RADAR not working.\n\nInform flag and class, obtain dispensation\n\nATTACHMENT : eMail.pdf "(mail from office requesting RA to be made and points to be included)"\n----------------------------------------------------\n\n## Note :- Pls read the workflow at the bottom of this document on how MATE generated the required response.\n\n## ABOUT THE WORKFLOW.\nUnderstanding the AI workflow allows for the creation of a tailored response that is highly accurate and specific to both you and your vessel type.\n\nThe M.A.T.E. workflow operates as follows:\nStep 1: M.A.T.E. receives your input and any additional information provided in the same query.\nStep 2: M.A.T.E. reviews any attachments included with your query.\nStep 3: M.A.T.E. references your user settings to curate a response specific to your configuration.\nStep 4: Where relevant, M.A.T.E. references company manuals from your downloads section to incorporate company-specific details into the generated response.\nNote: Please monitor your token usage, as processing or reviewing detailed manuals can consume a significant amount of your available tokens.\n\nxxx END xxx`;

  if (selectedAgentSlot) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12 selection:bg-gold selection:text-deep relative">
        {/* Top Navbar */}
        <div className="flex justify-between items-center mb-8 max-w-6xl mx-auto border-b border-border/60 pb-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <img src="/logo.jpeg" alt="M.A.T.E logo" width="36" height="36" className="rounded" />
              <span className="text-base font-black tracking-tight text-deep uppercase font-display">M.A.T.E</span>
            </div>
            <div className="bg-amber-100 text-[#FE7B02] text-xs font-bold px-3 py-1 rounded border border-[#FE7B02]/30">
              Token Usage : <span className="underline font-black">{interactionsCount} / {maxInteractions}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowUserManual(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-[#575ECF] hover:bg-indigo-50 border border-[#575ECF]/40 px-3 py-1.5 rounded-lg transition uppercase tracking-wider"
              title="View User Manual"
            >
              <BookOpen className="w-3.5 h-3.5" /> Manual
            </button>
            <span className="text-base font-black tracking-tight text-deep uppercase font-display">
              {selectedAgentSlot.code} - {selectedAgentSlot.name}
            </span>
            <button 
              onClick={() => {
                setSelectedAgentSlot(null);
                setWebRunResult(null);
                setStatusMsg(null);
              }}
              className="p-2 text-foreground hover:bg-secondary border border-border rounded-lg transition"
              title="Return Home"
            >
              <Home className="w-5 h-5 text-[#575ECF]" />
            </button>
          </div>
        </div>

        {/* Outer Form & Display Grid */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left panel (Steps, Inputs, Instructions) */}
          <div className="space-y-6">
            <form onSubmit={handleWebRunSubmit} className="bg-white border-2 border-[#1b1b1b] p-6 rounded-xl shadow-[4px_4px_0px_0px_#1b1b1b] space-y-5">

              {/* Step 1 */}
              <div>
                <label className="block text-sm font-bold text-[#1b1b1b] mb-2">
                  Step &#8211; 1 : Input the requirement
                </label>
                <textarea
                  required
                  rows={3}
                  value={webRunQueryInput}
                  onChange={e => setWebRunQueryInput(e.target.value)}
                  placeholder="e.g. detailed safety tasks description..."
                  className="w-full px-3 py-2.5 border border-[#1b1b1b] bg-[#FCFBF8] rounded-lg text-xs outline-none text-[#1b1b1b] transition font-medium focus:ring-1 focus:ring-[#575ECF]"
                />
              </div>

              {/* Step 2 */}
              <div>
                <label className="block text-sm font-bold text-[#1b1b1b] mb-2">
                  Step -2 : Include elements you want AI to include in the response
                </label>
                <textarea
                  rows={2}
                  value={elementsToInclude}
                  onChange={e => setElementsToInclude(e.target.value)}
                  placeholder="e.g. hazard identification points, reporting format (optional)..."
                  className="w-full px-3 py-2.5 border border-[#1b1b1b] bg-[#FCFBF8] rounded-lg text-xs outline-none text-[#1b1b1b] transition font-medium focus:ring-1 focus:ring-[#575ECF]"
                />
                <p className="mt-1.5 text-[11px] text-red-500 italic font-medium">
                  Optional; add a brief summary of specific points that you need AI to mention in the final output.
                </p>
              </div>

              {/* Step 3 - Insert additional reference material */}
              <div>
                <label className="block text-sm font-bold text-[#1b1b1b] mb-3">
                  Step -3 : Insert any additional reference material
                </label>

                {/* Existing files selector (compact) */}
                {uploadedFiles.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Select from your workspace / Global KB</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-3 bg-[#FCFBF8] border border-[#dcdad5] rounded-lg max-h-24 overflow-y-auto">
                      {uploadedFiles.map(file => (
                        <label key={file.id} className="flex items-center justify-between text-xs text-zinc-700 cursor-pointer select-none font-semibold p-1 hover:bg-zinc-50 rounded">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <input
                              type="checkbox"
                              checked={webRunSelectedFiles.includes(file.id)}
                              onChange={() => handleToggleFileSelection(file.id)}
                              className="rounded border-border text-gold focus:ring-gold"
                            />
                            <span className="truncate">{file.name}</span>
                          </div>
                          <span className={`text-[7px] uppercase tracking-wider font-extrabold px-1 rounded shrink-0 ${
                            file.file_type === 'knowledge_base' ? 'bg-indigo-100 text-[#575ECF]' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {file.file_type === 'knowledge_base' ? 'Global KB' : 'Workspace'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload new document - dashed box */}
                <div className="border border-[#dcdad5] rounded-lg p-3">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Upload New Reference Document</p>
                  <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-zinc-300 hover:border-[#575ECF] bg-[#FCFBF8] hover:bg-indigo-50/30 rounded-lg py-4 cursor-pointer transition group">
                    <span className="text-xs font-bold text-zinc-500 group-hover:text-[#575ECF] transition flex items-center gap-1.5">
                      <span className="text-base leading-none">+</span> Click to upload PDF, TXT, DOCX, MD
                    </span>
                    <input
                      type="file"
                      onChange={handleRunFileUpload}
                      className="hidden"
                      accept=".pdf,.docx,.doc,.txt,.md,.rtf"
                    />
                  </label>
                  <p className="mt-2 text-[11px] text-red-500 italic font-medium">
                    Optional. This will impact the total available storage space for the user.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-3.5">
                <label className="block text-sm font-bold text-[#1b1b1b]">
                  Step &#8211; 4 : Action Toggles &amp; Execution
                </label>
                
                <div className="flex items-center gap-2.5 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                  <input 
                    type="checkbox"
                    id="sendEmailCheck"
                    checked={sendEmailToggle}
                    onChange={e => setSendEmailToggle(e.target.checked)}
                    className="w-4 h-4 text-[#575ECF] rounded border-[#dcdad5] cursor-pointer"
                  />
                  <label htmlFor="sendEmailCheck" className="text-xs font-bold text-zinc-750 cursor-pointer select-none">
                    Send response via Email and Auto-download as Text (.txt)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isWebRunning}
                  className="w-full py-2.5 bg-[#1b1b1b] hover:bg-zinc-800 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition disabled:opacity-50 letter-spacing-widest"
                >
                  {isWebRunning ? "Processing..." : "Submit"}
                </button>
              </div>
            </form>

            {/* Instructions box */}
            <div className="bg-[#FAF9F6] border border-[#dcdad5] p-6 rounded-xl space-y-3.5">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">// Instructions :-</h4>
              <p className="text-red-600 italic text-xs leading-relaxed">
                For sending query via email; "{selectedAgentSlot.emailExample}"
              </p>
              <p className="text-zinc-600 text-[11px] leading-relaxed font-semibold">
                Pls ensure user specific information is filled out so that the responses generated are specific to your ship type.
              </p>
            </div>

            {/* Feedback box */}
            <form onSubmit={handleFeedbackSubmit} className="bg-[#FAF9F6] border border-[#dcdad5] p-6 rounded-xl space-y-4">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">// Any feedback provided would be greatly appreciated :-</h4>
              <textarea
                required
                rows={2}
                value={userFeedback}
                onChange={e => setUserFeedback(e.target.value)}
                placeholder="~ user feedback ~"
                className="w-full px-3 py-2 border border-[#dcdad5] bg-white rounded-lg text-xs outline-none text-[#1b1b1b] transition font-medium focus:border-[#575ECF]"
              />
              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#1b1b1b] hover:bg-[#2b2b2b] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition"
                >
                  Submit
                </button>
                {feedbackStatusMsg && (
                  <span className="text-xs font-bold text-emerald-600 animate-pulse">{feedbackStatusMsg}</span>
                )}
              </div>
            </form>
          </div>

          {/* Right panel (Output view) */}
          <div className="flex flex-col h-full">
            <div className="flex-1 bg-[#1b1b1b] border-2 border-[#1b1b1b] rounded-2xl shadow-[4px_4px_0px_0px_#1b1b1b] flex flex-col overflow-hidden min-h-[450px]">
              <div className="bg-[#2b2b2b] px-6 py-3.5 flex justify-between items-center border-b border-zinc-800">
                <span className="text-zinc-400 font-mono text-xs font-bold">// Response Terminal</span>
                {webRunResult && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleDownloadResult}
                      className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition"
                      title="Download Response Text"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleCopyResult}
                      className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition"
                      title="Copy to Clipboard"
                    >
                      <Clipboard className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 p-6 font-mono text-xs text-zinc-200 leading-relaxed overflow-y-auto whitespace-pre-wrap select-all">
                {webRunResult || (
                  <div className="text-zinc-500 italic text-center mt-12">
                    {isWebRunning ? "Agent is processing files & generating your safety response..." : "Response output will appear here after generation..."}
                  </div>
                )}
              </div>
            </div>
            {statusMsg && (
              <div className="mt-4 p-3 bg-indigo-50 border border-[#575ECF]/30 text-indigo-800 rounded-lg text-xs font-semibold">
                {statusMsg}
              </div>
            )}
          </div>
        </div>

      {/* User Manual Modal - Agent Run View */}
      {showUserManual && (
        <div className="fixed inset-0 bg-[#1b1b1b]/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="w-full max-w-2xl bg-white border-2 border-[#1b1b1b] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1d577a] px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-white" />
                <h3 className="font-black text-sm text-white uppercase tracking-wider">M.A.T.E User Manual</h3>
              </div>
              <button
                onClick={() => setShowUserManual(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 font-mono text-xs text-[#1b1b1b] leading-relaxed whitespace-pre-wrap flex-1 bg-[#FCFBF8]">
              {userManualContent || DEFAULT_USER_MANUAL}
            </div>
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 text-[10px] text-amber-800 font-semibold shrink-0">
              ⚠️ Disclaimer: M.A.T.E can make mistakes. Please re-verify all generated content before use.
            </div>
          </div>
        </div>
      )}
    </div>
    );
  }

  // ----------------------------------------------------
  // VIEW 2: STANDARD USER PAGE / DASHBOARD (Image 1)
  // ----------------------------------------------------
  const categoriesLeft = ['(A) ISM Admin Works', '(C) Crew Related', '(E) Inventories'];
  const categoriesRight = ['(B) Accounting & Payroll', '(D) Cargo Related', '(F) Misc, Additional'];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12 selection:bg-gold selection:text-deep relative">
      
      {/* Top Navbar */}
      <div className="flex justify-between items-center mb-8 max-w-6xl mx-auto border-b border-border/60 pb-6 relative z-10">
        <Link href="/" className="flex items-center gap-2.5 group">
          <img src="/logo.jpeg" alt="M.A.T.E logo" width="32" height="32" className="rounded" />
          <span className="text-base font-black tracking-tight text-deep uppercase font-display">M.A.T.E</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-lg font-black tracking-tight text-[#1b1b1b] italic font-display">User Page</span>
          <button
            onClick={() => setShowUserManual(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#575ECF] hover:bg-indigo-50 border border-[#575ECF]/40 px-3 py-1.5 rounded-lg transition uppercase tracking-wider"
            title="View User Manual"
          >
            <BookOpen className="w-3.5 h-3.5" /> User Manual
          </button>
          <button 
            onClick={handleLogout}
            className="text-xs text-foreground hover:bg-secondary transition flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border font-bold uppercase tracking-wider"
          >
            <LogOut className="w-3.5 h-3.5 text-[#575ECF]" /> Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        
        {/* Left Column (Profile & Settings Sidebar) */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Authenticated Officer block */}
          <div className="bg-white border border-[#1b1b1b] p-6 rounded-lg shadow-sm space-y-4">
            <h3 className="font-bold text-sm underline text-[#1b1b1b]">Authenticated Officer</h3>
            <div className="space-y-3.5 text-xs font-semibold text-zinc-700">
              <div className="border-b border-zinc-100 pb-2">
                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Mariner Profile</span>
                <div className="mt-1">Name: <span className="text-[#1b1b1b]">{fullNameInput || 'Officer'}</span></div>
                <div>Rank: <span className="text-[#1b1b1b]">{rankInput || 'Unspecified'}</span></div>
                <div>Company: <span className="text-[#1b1b1b]">{companyInput || 'Unspecified'}</span></div>
              </div>

              <div className="border-b border-zinc-100 pb-2">
                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Vessel Particulars</span>
                <div className="mt-1">Vessel: <span className="text-[#1b1b1b]">{vesselNameInput || 'Unspecified'}</span></div>
                <div>Type: <span className="text-[#1b1b1b]">{vesselTypeInput || 'Unspecified'}</span></div>
                <div>Operator: <span className="text-[#1b1b1b]">{operatorNameInput || 'Unspecified'}</span></div>
                <div>GRT: <span className="text-[#1b1b1b]">{grtInput || 'Unspecified'}</span></div>
              </div>

              <div>
                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Machinery &amp; Trading</span>
                <div className="mt-1">Pumping: <span className="text-[#1b1b1b]">{hasPumpRoom ? 'Pump Room' : `Deepwell Pumps (${pumpSystemType})`}</span></div>
                <div>Bow Thruster: <span className="text-[#1b1b1b]">{hasBowThruster ? 'Fitted' : 'Not Fitted'}</span></div>
                <div>Chem Cargo: <span className="text-[#1b1b1b]">{carriesChemicalCargo ? 'Yes' : 'No'}</span></div>
                <div>EGCS: <span className="text-[#1b1b1b]">{hasEgcs ? egcsType : 'None'}</span></div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {operatesUsWaters && <span className="px-1.5 py-0.5 bg-indigo-50 text-[#575ECF] text-[9px] rounded font-bold border border-indigo-200">US</span>}
                  {operatesAusNzWaters && <span className="px-1.5 py-0.5 bg-indigo-50 text-[#575ECF] text-[9px] rounded font-bold border border-indigo-200">AUS/NZ</span>}
                  {operatesEuWaters && <span className="px-1.5 py-0.5 bg-indigo-50 text-[#575ECF] text-[9px] rounded font-bold border border-indigo-200">EU</span>}
                  {operatesChineseWaters && <span className="px-1.5 py-0.5 bg-indigo-50 text-[#575ECF] text-[9px] rounded font-bold border border-indigo-200">China</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Dedicated Storage block */}
          <div className="bg-white border border-[#1b1b1b] p-6 rounded-lg shadow-sm">
            <h3 className="font-bold text-sm underline text-[#1b1b1b] mb-4">Dedicated Storage</h3>
            <div className="text-lg font-black text-[#1b1b1b] mb-3">
              {totalSpaceUsedMB} / 25mb
            </div>
            
            {subscriptionPlan !== 'premium' && (
              <div className="bg-amber-50 border border-[#FE7B02]/30 p-4 rounded-lg text-amber-800 text-[11px] leading-relaxed mb-4">
                You are utilizing your free 25MB space. Upgrade for 5GB limits.
              </div>
            )}

            {/* Upload Action */}
            <div className="relative">
              <input 
                type="file" 
                accept=".pdf,.docx,.doc,.txt,.md,.rtf"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              <button className="w-full py-2.5 bg-[#1b1b1b] hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition text-center flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" /> Upload Documents
              </button>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="mt-4 border-t border-zinc-100 pt-4 space-y-2 max-h-40 overflow-y-auto">
                {uploadedFiles.map(file => (
                  <div key={file.id} className="flex justify-between items-center text-[10px] text-zinc-600 bg-zinc-50 p-2 rounded">
                    <span className="truncate max-w-[140px] font-semibold" title={file.name}>{file.name}</span>
                    <div className="flex items-center gap-2.5">
                      <button onClick={() => triggerDownload(file)} className="text-[#575ECF] hover:underline font-bold">
                        Download
                      </button>
                      {file.file_type !== 'knowledge_base' && (
                        <button onClick={() => handleDeleteFile(file)} className="text-red-600 hover:underline font-bold">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workspace Settings block */}
          <div className="bg-white border border-[#1b1b1b] p-6 rounded-lg shadow-sm">
            <h3 className="font-bold text-sm underline text-[#1b1b1b] mb-4">Workspace Settings</h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Interaction eMail :-</label>
                <input 
                  type="email" 
                  value={vesselEmailInput}
                  onChange={e => setVesselEmailInput(e.target.value)}
                  placeholder="vessel@shipname.com"
                  className="w-full px-3 py-2 border border-[#1b1b1b] bg-[#FCFBF8] rounded-lg text-xs outline-none text-[#1b1b1b] font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="py-2.5 bg-[#1b1b1b] hover:bg-zinc-800 text-white rounded-lg font-bold text-[10px] uppercase tracking-wider transition text-center"
                >
                  Settings
                </button>
                <button 
                  type="submit" 
                  className="py-2.5 bg-[#1b1b1b] hover:bg-zinc-800 text-white rounded-lg font-bold text-[10px] uppercase tracking-wider transition text-center"
                >
                  Save
                </button>
              </div>
            </form>
          </div>

          {/* Help & Onboarding Guidelines (3 Cards/Buttons) */}
          <div className="bg-white border-2 border-[#1b1b1b] p-4 rounded-xl shadow-[4px_4px_0px_0px_#1b1b1b] space-y-3">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">// User Guides</h4>
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => setShowWorkflowHelp(true)}
                className="w-full py-3 px-4 bg-[#FCFBF8] border border-[#1b1b1b] hover:bg-indigo-50/40 text-[#1b1b1b] rounded-lg text-xs font-extrabold uppercase tracking-wide text-center transition shadow-[2px_2px_0px_0px_#1b1b1b] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#1b1b1b]"
              >
                Understand the AI workflow
              </button>
              <button 
                onClick={() => setShowWebUiHelp(true)}
                className="w-full py-3 px-4 bg-[#FCFBF8] border border-[#1b1b1b] hover:bg-indigo-50/40 text-[#1b1b1b] rounded-lg text-xs font-extrabold uppercase tracking-wide text-center transition shadow-[2px_2px_0px_0px_#1b1b1b] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#1b1b1b]"
              >
                How to query via <span className="text-[#575ECF] underline">WEB UI</span>
              </button>
              <button 
                onClick={() => setShowEmailHelp(true)}
                className="w-full py-3 px-4 bg-[#FCFBF8] border border-[#1b1b1b] hover:bg-indigo-50/40 text-[#1b1b1b] rounded-lg text-xs font-extrabold uppercase tracking-wide text-center transition shadow-[2px_2px_0px_0px_#1b1b1b] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#1b1b1b]"
              >
                How to query via <span className="text-red-600 underline">eMail</span>
              </button>
            </div>
          </div>

        </div>

        {/* Right Columns (Agents Grid & Interaction Log) */}
        <div className="lg:col-span-2 space-y-6">
          {statusMsg && (
            <div className="p-4 rounded-lg text-xs border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold">
              {statusMsg}
            </div>
          )}

          {/* Two-Column Category Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Category Column */}
            <div className="space-y-6">
              {categoriesLeft.map(cat => renderCategoryCard(cat))}
            </div>

            {/* Right Category Column */}
            <div className="space-y-6">
              {categoriesRight.map(cat => renderCategoryCard(cat))}
            </div>

          </div>

          {/* Bottom Interaction Log */}
          <div className="bg-white border border-[#1b1b1b] p-6 rounded-lg shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-[#575ECF]" />
              <h3 className="font-bold text-sm text-[#1b1b1b]">Interaction Log</h3>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {interactionHistory.length === 0 ? (
                <div className="text-zinc-400 text-xs text-center py-4 italic font-medium">
                  No interactions logged yet.
                </div>
              ) : (
                interactionHistory.map(log => (
                  <div 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)} 
                    className="flex justify-between items-center p-3 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg text-xs cursor-pointer transition"
                  >
                    <div className="font-bold text-zinc-700 truncate max-w-[280px]">
                      {log.subject}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-zinc-400 text-[10px]">
                        {new Date(log.created_at || Date.now()).toISOString().replace('T', ' ').substring(0, 16)}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border text-center ${
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
              {(userRole === 'analyst' || userRole === 'admin') && (
                <div>
                  <span className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">// Email/Portal Request:</span>
                  <div className="bg-background border border-border p-4 rounded-xl text-foreground font-medium leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {selectedLog.email_request || "No request text body logged."}
                  </div>
                </div>
              )}
              
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

      {/* Workspace Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-[#1b1b1b]/40 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-[#FAF9F6] border-b border-border px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-display text-sm font-semibold text-deep">Workspace Settings</h3>
                <span className="text-[9px] text-muted-foreground">Manage your officer profile data</span>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-secondary font-bold uppercase transition"
              >
                Close
              </button>
            </div>
            
            <form onSubmit={handleSaveSettings} className="p-6 overflow-y-auto space-y-4 font-sans text-xs">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  value={fullNameInput}
                  onChange={e => setFullNameInput(e.target.value)}
                  placeholder="e.g. Capt. John Doe"
                  className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Rank</label>
                <input 
                  type="text" 
                  value={rankInput}
                  onChange={e => setRankInput(e.target.value)}
                  placeholder="e.g. Master / Chief Engineer"
                  className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Company Name</label>
                <input 
                  type="text" 
                  value={companyInput}
                  onChange={e => setCompanyInput(e.target.value)}
                  placeholder="e.g. Ocean Shipping Ltd"
                  className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Interaction Email</label>
                <input 
                  type="email" 
                  value={vesselEmailInput}
                  onChange={e => setVesselEmailInput(e.target.value)}
                  placeholder="e.g. vessel@shipname.com"
                  className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
                <span className="block text-[9px] text-zinc-500 mt-1 font-semibold">
                  ⚠️ Note: You can only edit your Interaction Email once every 15 days to prevent account sharing.
                </span>
              </div>

              <div className="border-t border-border/60 pt-3">
                <h4 className="text-[10px] font-black text-deep uppercase tracking-wider mb-3">// Vessel Particulars</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Vessel Name</label>
                    <input 
                      type="text" 
                      value={vesselNameInput}
                      onChange={e => setVesselNameInput(e.target.value)}
                      placeholder="e.g. Pioneer Mariner"
                      className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Vessel Type</label>
                    <input 
                      type="text" 
                      value={vesselTypeInput}
                      onChange={e => setVesselTypeInput(e.target.value)}
                      placeholder="e.g. Oil Tanker, Bulk Carrier"
                      className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Operator Name</label>
                  <input 
                    type="text" 
                    value={operatorNameInput}
                    onChange={e => setOperatorNameInput(e.target.value)}
                    placeholder="e.g. V-Ships, Anglo-Eastern"
                    className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">GRT</label>
                  <input 
                    type="text" 
                    value={grtInput}
                    onChange={e => setGrtInput(e.target.value)}
                    placeholder="e.g. 45,000"
                    className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                  />
                </div>
              </div>

              <div className="border-t border-border/60 pt-3 space-y-3">
                <h4 className="text-[10px] font-black text-deep uppercase tracking-wider">// Machinery &amp; Cargo</h4>
                
                <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-border rounded-xl">
                  <input 
                    type="checkbox" 
                    id="hasPumpRoomCheck"
                    checked={hasPumpRoom}
                    onChange={e => {
                      setHasPumpRoom(e.target.checked);
                      if (e.target.checked) setPumpSystemType('N/A');
                      else setPumpSystemType('FRAMO');
                    }}
                    className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                  />
                  <label htmlFor="hasPumpRoomCheck" className="font-semibold text-zinc-700 cursor-pointer select-none">Vessel has a Pump Room?</label>
                </div>

                {!hasPumpRoom && (
                  <div>
                    <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Deepwell Pump System Type</label>
                    <select 
                      value={pumpSystemType}
                      onChange={e => setPumpSystemType(e.target.value)}
                      className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground font-semibold"
                    >
                      <option value="FRAMO">FRAMO System</option>
                      <option value="MARFLEX">MARFLEX System</option>
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-2 bg-[#FAF9F6] border border-border rounded-xl">
                    <input 
                      type="checkbox" 
                      id="hasBowThrusterCheck"
                      checked={hasBowThruster}
                      onChange={e => setHasBowThruster(e.target.checked)}
                      className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                    />
                    <label htmlFor="hasBowThrusterCheck" className="font-semibold text-zinc-700 cursor-pointer select-none">Bow Thruster?</label>
                  </div>

                  <div className="flex items-center gap-2 p-2 bg-[#FAF9F6] border border-border rounded-xl">
                    <input 
                      type="checkbox" 
                      id="carriesChemCheck"
                      checked={carriesChemicalCargo}
                      onChange={e => setCarriesChemicalCargo(e.target.checked)}
                      className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                    />
                    <label htmlFor="carriesChemCheck" className="font-semibold text-zinc-700 cursor-pointer select-none">Chem Cargo?</label>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-border rounded-xl">
                  <input 
                    type="checkbox" 
                    id="hasEgcsCheck"
                    checked={hasEgcs}
                    onChange={e => {
                      setHasEgcs(e.target.checked);
                      if (e.target.checked) setEgcsType('Open Loop');
                      else setEgcsType('N/A');
                    }}
                    className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                  />
                  <label htmlFor="hasEgcsCheck" className="font-semibold text-zinc-700 cursor-pointer select-none">EGCS Scrubber?</label>
                </div>

                {hasEgcs && (
                  <div>
                    <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">EGCS Scrubber Configuration</label>
                    <select 
                      value={egcsType}
                      onChange={e => setEgcsType(e.target.value)}
                      className="w-full px-3 py-2 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground font-semibold"
                    >
                      <option value="Open Loop">Open Loop System</option>
                      <option value="Closed Loop">Closed Loop System</option>
                      <option value="Hybrid">Hybrid System</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="border-t border-border/60 pt-3 space-y-2">
                <h4 className="text-[10px] font-black text-deep uppercase tracking-wider">// Active Trading Regions</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-2 p-2 bg-[#FAF9F6] border border-border rounded-xl cursor-pointer font-semibold text-zinc-700 select-none">
                    <input 
                      type="checkbox" 
                      checked={operatesUsWaters}
                      onChange={e => setOperatesUsWaters(e.target.checked)}
                      className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                    />
                    US Waters
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-[#FAF9F6] border border-border rounded-xl cursor-pointer font-semibold text-zinc-700 select-none">
                    <input 
                      type="checkbox" 
                      checked={operatesAusNzWaters}
                      onChange={e => setOperatesAusNzWaters(e.target.checked)}
                      className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                    />
                    AUS / NZ
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-[#FAF9F6] border border-border rounded-xl cursor-pointer font-semibold text-zinc-700 select-none">
                    <input 
                      type="checkbox" 
                      checked={operatesEuWaters}
                      onChange={e => setOperatesEuWaters(e.target.checked)}
                      className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                    />
                    EU Waters
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-[#FAF9F6] border border-border rounded-xl cursor-pointer font-semibold text-zinc-700 select-none">
                    <input 
                      type="checkbox" 
                      checked={operatesChineseWaters}
                      onChange={e => setOperatesChineseWaters(e.target.checked)}
                      className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                    />
                    Chinese Waters
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-border/60">
                <button 
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 border border-border rounded-full hover:bg-secondary font-bold text-[10px] uppercase tracking-wider transition text-center"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-bold text-[10px] uppercase tracking-wider rounded-full transition text-center shadow-md shadow-primary/20"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Manual Modal - Main Dashboard View */}
      {showUserManual && (
        <div className="fixed inset-0 bg-[#1b1b1b]/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="w-full max-w-2xl bg-white border-2 border-[#1b1b1b] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1d577a] px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-white" />
                <h3 className="font-black text-sm text-white uppercase tracking-wider">M.A.T.E User Manual</h3>
              </div>
              <button
                onClick={() => setShowUserManual(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 font-mono text-xs text-[#1b1b1b] leading-relaxed whitespace-pre-wrap flex-1 bg-[#FCFBF8]">
              {userManualContent || DEFAULT_USER_MANUAL}
            </div>
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 text-[10px] text-amber-800 font-semibold shrink-0">
              ⚠️ Disclaimer: M.A.T.E can make mistakes. Please re-verify all generated content before use.
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal 1: Understand the AI workflow */}
      {showWorkflowHelp && (
        <div className="fixed inset-0 bg-[#1b1b1b]/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="w-full max-w-2xl bg-white border-2 border-[#1b1b1b] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1b1b1b] px-6 py-4 flex justify-between items-center shrink-0">
              <span className="font-mono text-xs font-black text-white uppercase tracking-widest">// AI Document Generation Pipeline</span>
              <button onClick={() => setShowWorkflowHelp(false)} className="p-1 text-white hover:bg-white/20 rounded-full transition"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-6 font-sans text-xs bg-[#FCFBF8] text-[#1b1b1b] leading-relaxed">
              <div>
                <h4 className="font-black text-sm text-[#1b1b1b] mb-2 uppercase tracking-wide">1. Query Parsing &amp; Initial Redaction</h4>
                <p className="text-zinc-600 font-medium">
                  When a safety inquiry is received (via Email or Web UI), the system runs an early scrubbing check.
                  It redacts sensitive personal data (PII) like telephone numbers, personal emails, and individual names.
                </p>
              </div>

              <div>
                <h4 className="font-black text-sm text-[#1b1b1b] mb-2 uppercase tracking-wide">2. Document Grounding &amp; Context Retrieval</h4>
                <p className="text-zinc-600 font-medium">
                  The system checks your **Dedicated Workspace** for selected manuals or logs, and fetches active manuals linked by the Analyst (e.g. vessel SMS details, safety checklist items).
                  It extracts raw text files and feeds them directly as custom contextual layers.
                </p>
              </div>

              <div>
                <h4 className="font-black text-sm text-[#1b1b1b] mb-2 uppercase tracking-wide">3. Tailored Prompt Generation &amp; Delivery</h4>
                <p className="text-zinc-600 font-medium">
                  The active agent's system directives (the Captain prompt) are combined with your **Vessel Particulars** (vessel name, pump room configurations, trading water regulations, and gross tonnage limits).
                  The AI processes this complete bundle to produce professional checklists and guidelines.
                </p>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl space-y-2">
                <span className="block font-black text-indigo-900 uppercase text-[10px] tracking-wider">// Why this is reliable:</span>
                <p className="text-indigo-800 font-medium">
                  Every response is "grounded" in your vessel specs. If you don't have a pump room but have FRAMO deepwell pumps, the risk assessment instructions will automatically address deepwell hydraulic safeguards rather than pump room gas levels.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal 2: How to query via WEB UI */}
      {showWebUiHelp && (
        <div className="fixed inset-0 bg-[#1b1b1b]/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="w-full max-w-2xl bg-white border-2 border-[#1b1b1b] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1b1b1b] px-6 py-4 flex justify-between items-center shrink-0">
              <span className="font-mono text-xs font-black text-white uppercase tracking-widest">// UI Dashboard Execution Guide</span>
              <button onClick={() => setShowWebUiHelp(false)} className="p-1 text-white hover:bg-white/20 rounded-full transition"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 font-sans text-xs bg-[#FCFBF8] text-[#1b1b1b] leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white border border-[#dcdad5] rounded-xl space-y-2">
                  <span className="block font-black text-xs text-[#1b1b1b]">Step 1: Pick a Module Card</span>
                  <p className="text-zinc-500 font-medium">Click on any active card on your dashboard matching your target task (e.g. A1 Risk Assessment).</p>
                </div>

                <div className="p-4 bg-white border border-[#dcdad5] rounded-xl space-y-2">
                  <span className="block font-black text-xs text-[#1b1b1b]">Step 2: Enter Prompt Requirements</span>
                  <p className="text-zinc-500 font-medium">Describe your request in Step 1. In Step 2, optionally specify items you want included in the response.</p>
                </div>

                <div className="p-4 bg-white border border-[#dcdad5] rounded-xl space-y-2">
                  <span className="block font-black text-xs text-[#1b1b1b]">Step 3: Reference Documents</span>
                  <p className="text-zinc-500 font-medium">Check the boxes of files you want linked, or drag-and-drop a new document in Step 3. Uploaded documents save directly to your workspace.</p>
                </div>

                <div className="p-4 bg-white border border-[#dcdad5] rounded-xl space-y-2">
                  <span className="block font-black text-xs text-[#1b1b1b]">Step 4: Execute &amp; Download</span>
                  <p className="text-zinc-500 font-medium">Toggle email delivery if you want a backup, and click Submit. Your response compiles live and renders in the terminal panel.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
