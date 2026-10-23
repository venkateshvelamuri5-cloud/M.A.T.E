// Shared types and the fixed A1–F6 slot grid used across the analyst console.

export type AgentStatus = 'live' | 'paused' | 'draft';

export interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  slot_code?: string | null;
  instructions?: string | null;
  custom_questions?: string[] | null;
  keywords?: string | null;
  is_locked?: boolean;
  status?: AgentStatus | null;
  llm_provider?: string;
  bypass_keyword_match?: boolean;
  updated_at?: string | null;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  file_size_mb: number;
  created_at: string;
  storage_path: string;
  agent_id?: string | null;
  file_type?: string;
  ingest_status?: string | null;
  ingest_error?: string | null;
  page_count?: number | null;
  token_count?: number | null;
  section_count?: number | null;
  chunk_structure?: string | null;
  ocr_page_count?: number | null;
}

/** Status of a deployed agent. Rows saved before the status column existed fall back to is_locked. */
export function agentStatus(agent: Agent): AgentStatus {
  if (agent.status === 'live' || agent.status === 'paused' || agent.status === 'draft') return agent.status;
  return agent.is_locked ? 'paused' : 'live';
}

export const CATEGORY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type CategoryLetter = typeof CATEGORY_LETTERS[number];

export const DEFAULT_CATEGORY_NAMES: Record<CategoryLetter, string> = {
  A: '(A) ISM Admin Works',
  B: '(B) Accounting & Payroll',
  C: '(C) Crew Related',
  D: '(D) Cargo Related',
  E: '(E) Inventories',
  F: '(F) Misc, Additional'
};

export const LLM_PROVIDERS = [
  { value: 'groq', label: 'Groq (Llama 3.3 70B)', hint: 'Fastest, free tier' },
  { value: 'openai', label: 'OpenAI (GPT-4o-mini)', hint: 'Mature, low cost' },
  { value: 'gemini', label: 'Google Gemini (Flash)', hint: 'Good with long documents, low cost' },
  { value: 'claude', label: 'Anthropic Claude', hint: 'Strong reasoning and writing' },
  { value: 'perplexity', label: 'Perplexity (Sonar)', hint: 'Can search the web' },
  { value: 'sarvam', label: 'Sarvam AI (sarvam-105b)', hint: 'Indic languages, low cost' }
];

export interface AgentSlot {
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
export const AGENT_SLOTS_TEMPLATE: AgentSlot[] = [
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
