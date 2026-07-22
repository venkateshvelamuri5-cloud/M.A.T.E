"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../src/supabase-client';
import { Anchor, Home, Settings, Lock, ArrowLeft, Download, Clipboard, Inbox, Upload, FileText } from 'lucide-react';

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
  {
    code: 'A5',
    name: '',
    category: '(A) ISM Admin Works',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },
  {
    code: 'A6',
    name: '',
    category: '(A) ISM Admin Works',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
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
  {
    code: 'B5',
    name: '',
    category: '(B) Accounting & Payroll',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },
  {
    code: 'B6',
    name: '',
    category: '(B) Accounting & Payroll',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
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
  {
    code: 'C5',
    name: '',
    category: '(C) Crew Related',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },
  {
    code: 'C6',
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
  {
    code: 'D5',
    name: '',
    category: '(D) Cargo Related',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },
  {
    code: 'D6',
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
  {
    code: 'E5',
    name: '',
    category: '(E) Inventories',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },
  {
    code: 'E6',
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
  },
  {
    code: 'F5',
    name: '',
    category: '(F) Misc, Additional',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  },
  {
    code: 'F6',
    name: '',
    category: '(F) Misc, Additional',
    deployed: false,
    emailExample: '',
    placeholder1: '',
    systemDirective: ''
  }
];

export default function ModulePage({ params }: { params: { slot_code: string } }) {
  const router = useRouter();
  const slotCode = params.slot_code;

  // Session & User States
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [interactionsCount, setInteractionsCount] = useState(0);
  const [maxInteractions, setMaxInteractions] = useState(10);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState('free');

  // Active slot properties
  const [activeSlot, setActiveSlot] = useState<AgentSlot | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  // Form input & execution states
  const [webRunQueryInput, setWebRunQueryInput] = useState('');
  const [elementsToInclude, setElementsToInclude] = useState('');
  const [webRunSelectedFiles, setWebRunSelectedFiles] = useState<string[]>([]);
  const [isWebRunning, setIsWebRunning] = useState(false);
  const [webRunResult, setWebRunResult] = useState<string | null>(null);
  
  // Progress/Error logs inside terminal
  const [terminalLog, setTerminalLog] = useState<string | null>(null);

  // Feedback states
  const [userFeedback, setUserFeedback] = useState('');
  const [feedbackStatusMsg, setFeedbackStatusMsg] = useState<string | null>(null);

  // Email and Download Toggles
  const [sendEmailToggle, setSendEmailToggle] = useState(false);

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
        console.warn("Auth check failed, routing to login.");
        router.push('/login');
      }
    };
    checkSession();
  }, []);

  const fetchUserData = async (uid: string, email: string) => {
    try {
      // 1. Fetch Limits
      const { data: limits } = await supabase
        .from('usage_limits')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();

      if (limits) {
        setInteractionsCount(limits.interactions_count);
        setMaxInteractions(limits.max_interactions);
      }

      // Fetch Profile plan
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_plan')
        .eq('id', uid)
        .maybeSingle();
      if (profile?.subscription_plan) {
        setSubscriptionPlan(profile.subscription_plan);
      }

      // 2. Fetch Uploaded Files (only user workspace files)
      const { data: files } = await supabase
        .from('user_files')
        .select('*')
        .eq('user_id', uid);

      if (files) {
        setUploadedFiles(files);
      }

      // 3. Fetch Agents configuration
      const { data: dbAgents } = await supabase
        .from('agents')
        .select('*');

      if (dbAgents) {
        setAgents(dbAgents);
        
        // Find matching agent slot template
        const baseSlot = AGENT_SLOTS.find(s => s.code === slotCode);
        const dbAgent = dbAgents.find(a => a.slot_code === slotCode);

        if (dbAgent && dbAgent.is_locked) {
          setIsLocked(true);
        }

        if (baseSlot) {
          if (dbAgent) {
            setActiveSlot({
              ...baseSlot,
              name: dbAgent.name,
              systemDirective: dbAgent.system_prompt,
              emailExample: dbAgent.instructions || baseSlot.emailExample,
            });
          } else {
            setActiveSlot(baseSlot);
          }
        } else {
          // Check if it's a completely custom agent
          if (dbAgent) {
            setActiveSlot({
              code: slotCode,
              name: dbAgent.name,
              category: '(F) Misc, Additional',
              deployed: true,
              emailExample: dbAgent.instructions || `Send task to: ${dbAgent.name}`,
              placeholder1: "e.g., Enter your specific request.",
              systemDirective: dbAgent.system_prompt
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId || !e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));
    
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      setTerminalLog(`>>> FILE UPLOAD ERROR <<<\nUpload failed. Only PDF, DOCX, DOC, TXT, MD, and RTF files are allowed.`);
      return;
    }

    const totalSpaceUsedMB = parseFloat(
      uploadedFiles.reduce((acc, f) => acc + Number(f.file_size_mb), 0).toFixed(2)
    );

    const limitMB = subscriptionPlan === 'premium' ? 5000 : 25;
    if (totalSpaceUsedMB + fileSizeMB > limitMB) {
      setTerminalLog(`>>> FILE UPLOAD ERROR <<<\nUpload failed. This file exceeds your workspace capacity limit of ${limitMB}MB.`);
      return;
    }

    setTerminalLog(`[UPLOAD] Uploading "${file.name}" to storage bucket...`);

    try {
      const storagePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('user-spaces')
        .upload(storagePath, file);

      if (uploadErr) throw uploadErr;

      const { data: newFile, error: dbErr } = await supabase
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

      await supabase.from('interactions_log').insert({
        user_id: userId,
        subject: `Uploaded document: ${file.name}`,
        status: 'Completed'
      });

      setTerminalLog(`[UPLOAD SUCCESS] Successfully uploaded "${file.name}".`);
      fetchUserData(userId, emailInput);
      
      // Auto select the file
      if (newFile) {
        setWebRunSelectedFiles(prev => [...prev, newFile.id]);
      }

    } catch (err) {
      console.error(err);
      setTerminalLog(`>>> FILE UPLOAD ERROR <<<\nUpload failed: ${(err as Error).message}`);
    }
  };

  const handleToggleFileSelection = (fileId: string) => {
    setWebRunSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleWebRunSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !activeSlot || !webRunQueryInput) {
      setTerminalLog(">>> RUNTIME WARNING <<<\nPlease enter a task description.");
      return;
    }

    setIsWebRunning(true);
    setTerminalLog("[1/3] Initializing runtime. Reading ship profile...");
    setWebRunResult(null);

    // Get database agent ID
    const dbAgent = agents.find(a => a.slot_code === slotCode);
    const dbAgentId = dbAgent?.id;

    if (!dbAgentId) {
      setIsWebRunning(false);
      setTerminalLog(">>> RUNTIME ERROR <<<\nAgent profile not found in database. Please verify analyst deployment.");
      return;
    }

    // Step 2 updates
    setTimeout(() => {
      setTerminalLog(prev => prev + "\n[2/3] Extracting reference documents & syncing database credentials...");
    }, 800);

    setTimeout(() => {
      setTerminalLog(prev => prev + "\n[3/3] Sending payload to AI Engine. Generating grounded maritime safety response...");
    }, 1800);

    const queryToSend = `[Agent Category: ${activeSlot.category}]\n[Role: ${activeSlot.code} - ${activeSlot.name}]\n[Instructions: ${activeSlot.systemDirective}]\n\nRequirement:\n${webRunQueryInput}` +
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

      // Success
      setTimeout(() => {
        setWebRunResult(data.result);
        setTerminalLog(null);
        fetchUserData(userId, emailInput);

        // Auto download if toggle is enabled
        if (sendEmailToggle) {
          const blob = new Blob([data.result], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `${activeSlot.code}_${activeSlot.name.replace(/\s+/g, '_')}_response.txt`);
          document.body.appendChild(link);
          link.click();
          link.remove();
        }
      }, 2500);

    } catch (err) {
      console.error(err);
      setTimeout(() => {
        setIsWebRunning(false);
        setTerminalLog(`>>> RUNTIME ERROR <<<\nExecution failed: ${(err as Error).message}`);
      }, 2500);
    } finally {
      setTimeout(() => {
        setIsWebRunning(false);
      }, 2500);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFeedback || !userId || !activeSlot) return;
    setFeedbackStatusMsg("Sending feedback...");
    try {
      const { error } = await supabase.from('interactions_log').insert({
        user_id: userId,
        subject: `Feedback on ${activeSlot.code} - ${activeSlot.name}`,
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
          agentCode: activeSlot.code,
          agentName: activeSlot.name
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
      alert("Copied response to clipboard!");
    }
  };

  const handleDownloadResult = () => {
    if (webRunResult && activeSlot) {
      const blob = new Blob([webRunResult], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeSlot.code}_${activeSlot.name.replace(/\s+/g, '_')}_response.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  const handleDownloadResultRtf = () => {
    if (webRunResult && activeSlot) {
      // Convert plain text newlines to RTF control words
      const escapedText = webRunResult
        .replace(/\\/g, '\\\\')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/\n/g, '\\par\n');
      
      const rtfContent = `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}\n\\viewkind4\\uc1\\pard\\lang1033\\f0\\fs24\n{\\b M.A.T.E. - Agent ${activeSlot.code} - ${activeSlot.name} Response}\n\\par\\par\n${escapedText}\n}`;
      
      const blob = new Blob([rtfContent], { type: 'application/rtf;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeSlot.code}_${activeSlot.name.replace(/\s+/g, '_')}_response.rtf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  const handleDownloadInstructions = async () => {
    if (activeSlot) {
      let manualText = '';
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'user_manual')
          .maybeSingle();
        if (data?.value) {
          manualText = data.value;
        }
      } catch (err) {
        console.warn('Failed to fetch user manual for download:', err);
      }

      const content = `AGENT: ${activeSlot.code} - ${activeSlot.name}
CATEGORY: ${activeSlot.category}

(A1) RISK ASSESSMENT

The email sent out can be formatted or plain text. Plain text option is preferred to minimize the outbound email data packet size.

----------------------------------------------------
HOW TO :-
TO : mate@logmark-ai.com
SUBJECT : Enter the name of the module you want to query. Please ensure that you use one of the following: "RA", "RISK ASSESSMENT", "SAFETY ASSESSMENT", or "RISK ANALYSIS". Please note that the MATE ‘may not’ reliably process or recognize keywords outside of this list.
BODY : Insert a one liner query to the risk assessment module.

In a separate paragraph, spaced by a line, put in list of items you want the AI to mandatorily include in your risk assessment output.

ATTACHMENT : Any PDF relevant to the RA being generated can be added as an attachment; example – mail from office requiring points to be included in RA, extract of company manual or any other document that as relevant information that you want included in the risk assessment generated.

Note that; additional text after the RA request and attachment addition are optional.

!! Greater the detail mentioned in the requirement, the better will the output”
For example :- A query “Make RA for ‘midship crane not operating prior coming to port’” will give a poor result compared to ‘Midship crane non-operational as required by terminal requirement prior vessel coming into terminal for loading operation’
----------------------------------------------------

----------------------------------------------------
EXAMPLE :-
TO : mate@logmark-ai.com

SUBJECT : Risk Assessment

BODY : 
Make a RA for X-band RADAR not working.

Inform flag and class, obtain dispensation

ATTACHMENT : eMail.pdf “(mail from office requesting RA to be made and points to be included)” 
----------------------------------------------------

## Note :- Pls read the workflow at the bottom of this document on how MATE generated the required response.

====================================================
M.A.T.E. USER MANUAL & GUIDELINES
====================================================

${manualText || 'No additional user manual content found in settings.'}`
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeSlot.code}_Instructions_Template.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6">
        <div className="flex flex-col items-center">
          <img src="/logo.jpeg" alt="M.A.T.E logo" width="64" height="64" className="rounded-xl border border-border/80 shadow-sm animate-pulse mb-4" />
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Verifying Session...</p>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6">
        <div className="w-full max-w-md bg-card border border-border p-8 rounded-xl shadow-md text-center">
          <Lock className="w-12 h-12 text-red-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-lg font-black text-deep mb-2">Agent Slot Locked</h2>
          <p className="text-muted-foreground text-xs leading-relaxed mb-6 font-medium">
            This module has been temporarily locked by the administrator for safety-updates or directive configuration. Please check back shortly.
          </p>
          <button 
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2.5 bg-primary text-white font-bold text-xs uppercase tracking-wider rounded-lg transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!activeSlot) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6">
        <div className="w-full max-w-md bg-card border border-border p-8 rounded-xl shadow-md text-center">
          <h2 className="text-lg font-black text-deep mb-2">Loading Agent Profile...</h2>
          <p className="text-muted-foreground text-xs leading-relaxed mb-6 font-medium">
            Checking status coordinates for {slotCode}...
          </p>
          <button 
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2.5 bg-primary text-white font-bold text-xs uppercase tracking-wider rounded-lg transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12 selection:bg-gold selection:text-deep relative">
      {/* Top Navbar */}
      <div className="flex justify-between items-center mb-8 max-w-6xl mx-auto border-b border-border/60 pb-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="M.A.T.E logo" width="36" height="36" className="rounded" />
            <span className="text-base font-black tracking-tight text-deep uppercase font-display">M.A.T.E</span>
          </Link>
          <div className="bg-amber-100 text-[#FE7B02] text-xs font-bold px-3 py-1 rounded border border-[#FE7B02]/30">
            Token Usage : <span className="underline font-black">{interactionsCount} / {maxInteractions}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-base font-black tracking-tight text-deep uppercase font-display">
            {activeSlot.code} - {activeSlot.name}
          </span>
          <button 
            onClick={() => router.push('/dashboard')}
            className="p-2 text-foreground hover:bg-secondary border border-border rounded-lg transition"
            title="Return to Dashboard"
          >
            <Home className="w-5 h-5 text-[#575ECF]" />
          </button>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left panel */}
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
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.doc,.txt,.md,.rtf"
                  />
                </label>
                <p className="mt-2 text-[11px] text-red-500 italic font-medium">
                  Optional. This will impact the to total available storage space for the user.
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

          {/* Instructions Box */}
          <div className="bg-[#FAF9F6] border border-[#dcdad5] p-6 rounded-xl space-y-3.5 flex flex-col justify-between">
            <div>
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">// Instructions :-</h4>
              <p className="text-red-600 italic text-xs leading-relaxed mt-2">
                For sending query via email; "{activeSlot.emailExample}"
              </p>
              <p className="text-zinc-600 text-[11px] leading-relaxed font-semibold mt-2">
                Pls ensure user specific information is filled out so that the responses generated are specific to your ship type.
              </p>
            </div>
            <button
              onClick={handleDownloadInstructions}
              type="button"
              className="mt-3 py-2 px-4 border border-[#dcdad5] hover:bg-zinc-100 rounded-lg text-xs font-bold text-zinc-700 transition flex items-center justify-center gap-1.5 w-fit"
            >
              <Download className="w-3.5 h-3.5 text-[#575ECF]" /> Download Instructions & Template
            </button>
          </div>

          {/* Feedback Box */}
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

        {/* Right panel (Terminal View) */}
        <div className="flex flex-col h-full">
          <div className="flex-1 bg-[#1b1b1b] border-2 border-[#1b1b1b] rounded-2xl shadow-[4px_4px_0px_0px_#1b1b1b] flex flex-col overflow-hidden min-h-[450px]">
            <div className="bg-[#2b2b2b] px-6 py-3.5 flex justify-between items-center border-b border-zinc-800">
              <span className="text-zinc-400 font-mono text-xs font-bold">// Response Terminal</span>
              {webRunResult && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownloadResult}
                    className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition flex items-center gap-1"
                    title="Download Response TXT"
                  >
                    <Download className="w-4 h-4" />
                    <span className="text-[9px] font-mono font-bold">TXT</span>
                  </button>
                  <button
                    onClick={handleDownloadResultRtf}
                    className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition flex items-center gap-1"
                    title="Download Response RTF"
                  >
                    <Download className="w-4 h-4 text-[#FE7B02]" />
                    <span className="text-[9px] font-mono font-bold">RTF</span>
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
              {webRunResult ? (
                webRunResult
              ) : isWebRunning ? (
                <div className="space-y-2 text-zinc-400 font-mono">
                  <div className="text-zinc-500 animate-pulse font-bold">{">>> EXECUTING AGENT RUNTIME v1.0.4 <<<"}</div>
                  <div className="whitespace-pre">{terminalLog}</div>
                </div>
              ) : terminalLog ? (
                <div className="text-rose-500 font-bold font-mono whitespace-pre">
                  {terminalLog}
                </div>
              ) : (
                <div className="text-zinc-500 italic text-center mt-12">
                  Response output will appear here after generation...
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
