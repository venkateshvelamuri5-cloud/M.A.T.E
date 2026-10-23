import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { GeminiService } from '../../../../src/services/gemini';
import { buildRetrievedContext, classifyDocument, contextBudgetFor, RetrievalFile } from '../../../../src/services/documents/retrieval';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Same stop words as the web run route, so the test searches documents the way a real run does.
const STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'about', 'against', 'from', 'this', 'that', 'vessel', 'management', 'safety',
  'of', 'in', 'on', 'at', 'to', 'by', 'is', 'it', 'an', 'as', 'or', 'be', 'do', 'so', 'no', 'if', 'we', 'he',
  'my', 'go', 'me', 'up', 'us', 'are', 'was', 'but', 'not', 'you', 'our', 'his', 'her', 'its', 'has', 'had',
  'can', 'out', 'all', 'any', 'who', 'how', 'why', 'new', 'now', 'own', 'one', 'two', 'use', 'get', 'see',
  'day', 'way', 'due', 'she', 'they', 'them', 'their', 'him', 'whom', 'which', 'what', 'these', 'those',
  'please', 'make', 'need', 'have', 'does', 'show', 'your', 'were', 'there', 'only', 'also', 'include',
  'report', 'send', 'query', 'task', 'run', 'agent'
]);

const TEST_PROFILE = `
Vessel Particulars & Systems:
- Vessel Name: TEST VESSEL (Type: General)
- This is a test run from the analyst console. No officer profile is attached.
`;

/**
 * POST /api/agent/test (analysts only)
 * Runs an agent's unsaved settings against a sample query. Nothing is logged, no officer's limit
 * changes and no email is sent. Body:
 * { query, slotCode, agentId?, draft: { name, system_prompt, keywords, llm_provider, bypass_keyword_match }, linkedFileIds }
 */
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Sign in again to run a test.' }, { status: 401 });
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Sign in again to run a test.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'analyst') return NextResponse.json({ error: 'Only analysts can test agents.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const query: string = (body.query || '').trim();
  const draft = body.draft || {};
  const slotCode: string = body.slotCode || '';
  const agentId: string | null = body.agentId || null;
  const linkedFileIds: string[] = Array.isArray(body.linkedFileIds) ? body.linkedFileIds : [];
  if (!query) return NextResponse.json({ error: 'Type a sample email or question to test with.' }, { status: 400 });
  if (!draft.system_prompt) return NextResponse.json({ error: 'Add instructions for the AI before testing.' }, { status: 400 });

  const started = Date.now();
  const gemini = new GeminiService();

  // 1. Routing: where would this text go if it arrived by email, with the draft keywords in place?
  const { data: allAgents } = await supabase.from('agents').select('id, name, slot_code, keywords, status, is_locked');
  const routable = (allAgents || [])
    .filter(a => a.slot_code !== slotCode)
    .filter(a => (a.status ? a.status === 'live' : !a.is_locked));
  const self = { id: agentId || '__draft__', name: draft.name || slotCode, slot_code: slotCode, keywords: draft.keywords || '' };
  const candidates = [...routable, self];
  let routing: { method: 'slot_code' | 'keyword' | 'none'; slotCode?: string; name?: string; isThisAgent: boolean };
  const slotMatch = query.match(/[\[\(]?\b([A-F][1-6])\b[\]\)]?/i);
  const slotAgent = slotMatch ? candidates.find(a => a.slot_code?.toUpperCase() === slotMatch[1].toUpperCase()) : null;
  if (slotAgent) {
    routing = { method: 'slot_code', slotCode: slotAgent.slot_code, name: slotAgent.name, isThisAgent: slotAgent.slot_code === slotCode };
  } else {
    const matchId = gemini.fuzzyKeywordMatch(query, candidates);
    const matched = candidates.find(a => a.id === matchId);
    routing = matched
      ? { method: 'keyword', slotCode: matched.slot_code, name: matched.name, isThisAgent: matched.slot_code === slotCode }
      : { method: 'none', isThisAgent: false };
  }

  // 2. Documents: the draft's linked files plus the global knowledge base.
  const keywords = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
  const [{ data: linkedFiles }, { data: globalFiles }] = await Promise.all([
    linkedFileIds.length
      ? supabase.from('user_files').select('id, name, file_type, token_count, ingest_status').in('id', linkedFileIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('user_files').select('id, name, file_type, token_count, ingest_status').eq('file_type', 'knowledge_base').is('agent_id', null)
  ]);
  const linkedSet = new Set(linkedFileIds);
  const files = new Map<string, any>();
  for (const f of [...(linkedFiles || []), ...(globalFiles || [])]) files.set(f.id, f);

  const ready: RetrievalFile[] = [];
  const skipped: string[] = [];
  for (const f of Array.from(files.values())) {
    if (f.ingest_status !== 'ready') {
      if (linkedSet.has(f.id)) skipped.push(f.name);
      continue;
    }
    const isLinked = linkedSet.has(f.id);
    ready.push({
      id: f.id,
      name: f.name,
      token_count: f.token_count,
      scope: isLinked ? 'agent' : 'global',
      classification: classifyDocument(f),
      preferWhole: isLinked || !!draft.bypass_keyword_match
    });
  }
  const provider = draft.llm_provider || 'groq';
  const context = ready.length ? await buildRetrievedContext(ready, keywords, contextBudgetFor(provider)) : '';

  // Which documents and sections made it into the context, for the trace.
  const documents: { name: string; sections: string[] }[] = [];
  for (const block of context.split('=== GROUNDING DOCUMENT ===').slice(1)) {
    const name = block.match(/Filename: (.+)/)?.[1]?.trim() || 'Document';
    const sections = Array.from(block.matchAll(/\[Section: ([^\]]+)\]/g)).map(m => m[1]);
    documents.push({ name, sections: sections.slice(0, 8) });
  }

  // 3. Run the model with the draft prompt.
  let output: string;
  try {
    output = await gemini.runGroundedQuery(query, `${TEST_PROFILE}\n\n${context}`, [], draft.system_prompt, provider, agentId || undefined);
  } catch (err) {
    return NextResponse.json({ error: `The AI provider returned an error: ${(err as Error).message}`, routing, documents, skipped }, { status: 502 });
  }

  // Same rough token and cost estimate the run route logs.
  const inputTokens = Math.ceil((query.length + TEST_PROFILE.length + context.length + draft.system_prompt.length) / 4);
  const outputTokens = Math.ceil((output || '').length / 4);
  const highContext = inputTokens > 128000;
  const cost = (inputTokens * (highContext ? 0.15 : 0.075) + outputTokens * (highContext ? 0.6 : 0.3)) / 1_000_000;

  return NextResponse.json({
    output,
    routing,
    documents,
    skipped,
    provider,
    inputTokens,
    outputTokens,
    cost: parseFloat(cost.toFixed(6)),
    ms: Date.now() - started
  });
}
