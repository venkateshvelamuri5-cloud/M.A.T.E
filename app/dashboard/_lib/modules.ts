// Turns the analyst-managed agents into the modules an officer sees, and builds/reads the
// request text the run endpoint expects. The slot grid itself is shared with the analyst console.

import { AGENT_SLOTS_TEMPLATE, AgentSlot, CATEGORY_LETTERS, CategoryLetter, DEFAULT_CATEGORY_NAMES } from '../../analyst/_lib/slots';

export interface OfficerAgent {
  id: string;
  name: string;
  description?: string | null;
  system_prompt?: string | null;
  slot_code?: string | null;
  instructions?: string | null;
  custom_questions?: string[] | null;
  keywords?: string | null;
  is_locked?: boolean;
  status?: string | null;
}

export interface Module {
  code: string;
  letter: CategoryLetter;
  name: string;
  description: string;
  /** Category label sent to the run endpoint, as the old pages did. */
  category: string;
  agentId: string;
  paused: boolean;
  systemDirective: string;
  emailExample: string;
  examples: string[];
  mustIncludeHint: string;
  keywords: string[];
  customQuestions: string[];
}

export interface ComingSoon {
  code: string;
  letter: CategoryLetter;
  name: string;
}

const stripEg = (s: string) => s.replace(/^e\.g\.,?\s*/i, '').trim();

/** Live and paused agents become modules. Drafts never reach officers. */
export function buildModules(agents: OfficerAgent[]): { modules: Module[]; comingSoon: ComingSoon[] } {
  const visible = agents.filter(a => a.slot_code && a.status !== 'draft');
  const modules: Module[] = [];
  const used = new Set<string>();

  const toModule = (agent: OfficerAgent, slot: AgentSlot | undefined, code: string): Module => {
    const letter = (CATEGORY_LETTERS as readonly string[]).includes(code[0]) ? code[0] as CategoryLetter : 'F';
    const examples = [slot?.placeholder1 ? stripEg(slot.placeholder1) : '', slot?.emailExample || '', agent.instructions && agent.instructions.length < 140 ? agent.instructions : '']
      .map(s => s.trim()).filter(Boolean);
    return {
      code,
      letter,
      name: agent.name,
      description: (agent.description || '').trim(),
      category: slot?.category || DEFAULT_CATEGORY_NAMES[letter],
      agentId: agent.id,
      paused: !!agent.is_locked || agent.status === 'paused',
      systemDirective: agent.system_prompt || slot?.systemDirective || '',
      emailExample: agent.instructions || slot?.emailExample || '',
      examples: Array.from(new Set(examples)).slice(0, 3),
      mustIncludeHint: slot?.placeholder2 || 'Points the answer must cover, one per line',
      keywords: (agent.keywords || '').split(',').map(k => k.trim()).filter(Boolean),
      customQuestions: agent.custom_questions || []
    };
  };

  for (const slot of AGENT_SLOTS_TEMPLATE) {
    const agent = visible.find(a => a.slot_code?.toUpperCase() === slot.code);
    if (!agent) continue;
    used.add(agent.id);
    modules.push(toModule(agent, slot, slot.code));
  }
  // Agents saved under a code outside the A1–F6 grid (older custom agents) still show, under their own code.
  for (const agent of visible) {
    if (used.has(agent.id)) continue;
    modules.push(toModule(agent, undefined, agent.slot_code!.toUpperCase()));
  }

  const comingSoon = AGENT_SLOTS_TEMPLATE
    .filter(s => s.name && !modules.some(m => m.code === s.code))
    .map(s => ({ code: s.code, letter: s.code[0] as CategoryLetter, name: s.name }));

  return { modules, comingSoon };
}

/** The request text the run endpoint has always received, so caching and routing behave as before. */
export function buildQuery(module: Module, requirement: string, mustInclude: string) {
  return `[Agent Category: ${module.category}]\n[Role: ${module.code} - ${module.name}]\n[Instructions: ${module.systemDirective}]\n\nRequirement:\n${requirement}` +
    (mustInclude.trim() ? `\n\nAdditional elements to include:\n${mustInclude}` : '');
}

/** Server side: the same request text, built from the agent row so the instructions come from the database. */
export function buildQueryForAgent(agent: { name: string; slot_code?: string | null; system_prompt?: string | null }, requirement: string, mustInclude: string) {
  const code = (agent.slot_code || '').toUpperCase();
  const slot = AGENT_SLOTS_TEMPLATE.find(s => s.code === code);
  const letter = (CATEGORY_LETTERS as readonly string[]).includes(code[0]) ? code[0] as CategoryLetter : 'F';
  return buildQuery({
    category: slot?.category || DEFAULT_CATEGORY_NAMES[letter],
    code, name: agent.name, systemDirective: agent.system_prompt || slot?.systemDirective || ''
  } as Module, requirement, mustInclude);
}

/** Pulls the officer's own words back out of a logged request (web runs carry a header we don't show). */
export function parseRequest(raw?: string | null): { requirement: string; mustInclude: string } {
  if (!raw) return { requirement: '', mustInclude: '' };
  const reqIdx = raw.indexOf('Requirement:\n');
  if (reqIdx === -1) return { requirement: raw.trim(), mustInclude: '' };
  const rest = raw.slice(reqIdx + 'Requirement:\n'.length);
  const incIdx = rest.indexOf('\n\nAdditional elements to include:\n');
  if (incIdx === -1) return { requirement: rest.trim(), mustInclude: '' };
  return { requirement: rest.slice(0, incIdx).trim(), mustInclude: rest.slice(incIdx + '\n\nAdditional elements to include:\n'.length).trim() };
}

/** Log rows that are not runs: uploads and feedback share the table. */
export function isRunLog(subject: string, errorMessage?: string | null) {
  if (subject.startsWith('Uploaded document:')) return false;
  if (subject.startsWith('Feedback on ')) return false;
  if (errorMessage?.startsWith('User Feedback:')) return false;
  return true;
}

export const ALLOWED_UPLOADS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.xlsx', '.xls', '.csv'];
export const FREE_STORAGE_MB = 25;
export const PREMIUM_STORAGE_MB = 5000;
export const MATE_EMAIL = 'mate@logmark-ai.com';

export function storageLimitMb(plan: string) {
  return plan === 'premium' ? PREMIUM_STORAGE_MB : FREE_STORAGE_MB;
}

export function fileExtension(name: string) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

export function safeFileName(s: string) {
  return s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'response';
}

// Everyday words officers use for each module, beyond the keywords the analysts set.
const HINTS: Record<string, string[]> = {
  A1: ['risk', 'ra', 'hazard', 'hazards', 'jha', 'jsa', 'assessment', 'unsafe', 'aloft', 'enclosed', 'hot work', 'defect', 'inoperative', 'not working', 'failure', 'breakdown'],
  A2: ['audit', 'capa', 'psc', 'deficiency', 'deficiencies', 'finding', 'findings', 'non conformity', 'nc', 'observation', 'root cause', 'inspection', 'closure'],
  A3: ['drill', 'drills', 'muster', 'abandon ship', 'fire drill', 'man overboard', 'emergency'],
  A4: ['training', 'minutes', 'meeting', 'toolbox', 'familiarisation', 'familiarization', 'session'],
  B1: ['payroll', 'wages', 'wage', 'salary', 'overtime', 'allotment', 'allotments'],
  B2: ['accounts', 'cash', 'master cash', 'welfare', 'disbursement', 'expenses'],
  B3: ['bond', 'slop chest', 'bonded', 'cigarettes', 'store sales'],
  B4: ['victualling', 'provisions', 'catering', 'food', 'man day', 'galley'],
  C1: ['port papers', 'crew list', 'clearance', 'immigration', 'customs', 'declaration', 'arrival'],
  C2: ['stcw', 'certificate', 'certificates', 'endorsement', 'coc', 'medical', 'sea service'],
  C3: ['sire', 'vetting', 'oil major', 'inspection questions', 'viq'],
  D1: ['voyage', 'voyage orders', 'charterer', 'charter party', 'instructions', 'eta', 'speed', 'consumption'],
  D2: ['cargo', 'ullage', 'trim', 'draft', 'density', 'loading', 'discharge', 'stability', 'calculation'],
  E1: ['library', 'publications', 'charts', 'books', 'nautical publications'],
  E2: ['ship certificates', 'survey', 'surveys', 'expiry', 'class', 'statutory'],
  E3: ['medicine', 'medical chest', 'drugs', 'first aid', 'hospital'],
  F1: ['sms', 'procedure', 'procedures', 'manual', 'policy', 'company', 'checklist', 'bunkering', 'permit'],
  F2: ['weather', 'cyclone', 'storm', 'routing', 'swell', 'wind', 'forecast', 'typhoon', 'hurricane'],
  F4: ['question', 'what is', 'how to', 'explain', 'regulation', 'marpol', 'solas', 'colreg']
};

export interface Suggestion { module: Module; score: number }

/** Ranks modules for a free-text request: analyst keywords first, then everyday words, name and description. */
export function suggestModules(text: string, modules: Module[], limit = 3): Suggestion[] {
  const q = ` ${text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ')} `;
  if (q.trim().length < 3) return [];
  const has = (term: string) => term.length > 1 && q.includes(` ${term.toLowerCase().trim()} `) ||
    (term.length > 4 && q.includes(` ${term.toLowerCase().trim()}`));
  const scored = modules.filter(m => !m.paused).map(m => {
    let score = 0;
    if (q.includes(` ${m.code.toLowerCase()} `)) score += 10;
    m.keywords.forEach(k => { if (has(k)) score += 4; });
    (HINTS[m.code] || []).forEach(k => { if (has(k)) score += 3; });
    m.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3).forEach(w => { if (q.includes(` ${w}`)) score += 2; });
    m.description.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 4).forEach(w => { if (q.includes(` ${w}`)) score += 1; });
    return { module: m, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  if (scored.length === 0) {
    const general = modules.find(m => m.code === 'F4' && !m.paused);
    return general ? [{ module: general, score: 0 }] : [];
  }
  return scored.slice(0, limit);
}

/** Plain-text preview of a Markdown answer. */
export function plainPreview(md: string, length = 160) {
  return md.replace(/\[CACHED RESPONSE[^\]]*\]/g, '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|]+/g, ' ').replace(/-{3,}/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, length);
}
