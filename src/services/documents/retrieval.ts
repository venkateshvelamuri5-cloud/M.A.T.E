import { supabase } from '../../supabase-client';

/**
 * Document Retrieval Service
 * Builds grounding context from processed (chunked) files: small agent or selected files are
 * included whole, everything else contributes only its best-matching sections, verbatim,
 * within a token budget. Output uses the same "=== GROUNDING DOCUMENT ===" blocks as before.
 */

export interface RetrievalFile {
  id: string;
  name: string;
  token_count?: number | null;
  /** 'agent' = linked to the agent handling the query, 'global' = knowledge base, 'user' = workspace. */
  scope: 'agent' | 'global' | 'user';
  classification: string;
  /** Include the whole file when it is small enough (agent-linked, explicitly selected or bypass mode). */
  preferWhole: boolean;
}

interface ChunkRow {
  id: string;
  file_id: string;
  chunk_index: number;
  heading_path: string;
  page_from: number | null;
  page_to: number | null;
  content: string;
  token_count: number;
  rank?: number;
}

const WHOLE_FILE_MAX_TOKENS = 6000;
const SEARCH_LIMIT = 40;
const SCOPE_WEIGHT: Record<RetrievalFile['scope'], number> = { agent: 1.5, global: 1.2, user: 1.0 };

export function contextBudgetFor(llmProvider: string): number {
  const configured = Number(process.env.DOC_CONTEXT_BUDGET_TOKENS);
  if (configured > 0) return configured;
  const provider = (llmProvider || 'groq').toLowerCase();
  // Sarvam's sarvam-105b reads long prompts slowly: 60K tokens of sections took answers past two minutes.
  return provider === 'groq' || provider === 'sarvam' ? 20000 : 60000;
}

async function fetchWholeFile(fileId: string): Promise<ChunkRow[]> {
  const { data, error } = await supabase
    .from('document_chunks')
    .select('id, file_id, chunk_index, heading_path, page_from, page_to, content, token_count')
    .eq('file_id', fileId)
    .order('chunk_index');
  if (error) console.error(`[Retrieval] Failed to load chunks for ${fileId}:`, error.message);
  return data || [];
}

function formatSection(c: ChunkRow): string {
  const pages = c.page_from ? ` | pages ${c.page_from}${c.page_to && c.page_to !== c.page_from ? `–${c.page_to}` : ''}` : '';
  return `[Section: ${c.heading_path || 'Untitled'}${pages}]\n${c.content}`;
}

export async function buildRetrievedContext(files: RetrievalFile[], keywords: string[], budgetTokens: number): Promise<string> {
  if (files.length === 0) return '';
  const byId = new Map(files.map(f => [f.id, f]));
  const selected = new Map<string, ChunkRow>();
  let used = 0;
  const take = (c: ChunkRow) => {
    if (selected.has(c.id) || used + c.token_count > budgetTokens) return false;
    selected.set(c.id, c);
    used += c.token_count;
    return true;
  };

  // 1. Small files that define the agent's format or were picked by the user go in whole.
  const wholeFiles = files.filter(f => f.preferWhole && (f.token_count || 0) > 0 && (f.token_count || 0) <= WHOLE_FILE_MAX_TOKENS);
  for (const f of wholeFiles) {
    for (const c of await fetchWholeFile(f.id)) take(c);
  }

  // 2. Best-matching sections across everything else, weighted by scope.
  const searchIds = files.filter(f => !wholeFiles.includes(f)).map(f => f.id);
  if (searchIds.length > 0 && keywords.length > 0) {
    const { data, error } = await supabase.rpc('search_document_chunks', {
      p_file_ids: searchIds,
      p_terms: keywords,
      p_limit: SEARCH_LIMIT,
    });
    if (error) console.error('[Retrieval] Search failed:', error.message);
    const ranked = ((data || []) as ChunkRow[])
      .map(c => ({ ...c, score: (c.rank || 0) * SCOPE_WEIGHT[byId.get(c.file_id)?.scope || 'user'] }))
      .sort((a, b) => b.score - a.score);
    for (const c of ranked) take(c);
  }

  // 3. Nothing matched: fall back to the opening sections of the agent's own documents.
  if (selected.size === 0) {
    for (const f of files.filter(f => f.scope === 'agent')) {
      for (const c of (await fetchWholeFile(f.id)).slice(0, 3)) take(c);
    }
  }

  // Group by file, in priority order, with sections back in document order.
  const order: RetrievalFile['scope'][] = ['agent', 'global', 'user'];
  const groups = files
    .filter(f => Array.from(selected.values()).some(c => c.file_id === f.id))
    .sort((a, b) => order.indexOf(a.scope) - order.indexOf(b.scope));

  console.log(`[Retrieval] ${selected.size} sections from ${groups.length} file(s), ~${used} tokens (budget ${budgetTokens})`);
  return groups.map(f => {
    const sections = Array.from(selected.values())
      .filter(c => c.file_id === f.id)
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .map(formatSection)
      .join('\n\n');
    return `\n\n=== GROUNDING DOCUMENT ===\nFilename: ${f.name}\nClassification: ${f.classification}\n\nRelevant Excerpts:\n"""\n${sections}\n"""\n==========================\n`;
  }).join('');
}

const MANUAL_NAME_HINTS = ['manual', 'sms', 'smp', 'omp', 'bdp', 'erp'];

/** Same classification the query routes use for whole-file context. */
export function classifyDocument(file: { name: string; file_type?: string | null }): string {
  const name = file.name.toLowerCase();
  const isCompanyManual = file.file_type === 'knowledge_base' || MANUAL_NAME_HINTS.some(h => name.includes(h));
  return isCompanyManual ? 'Company Manual / Policy (Primary Authority)' : 'User Workspace Document';
}
