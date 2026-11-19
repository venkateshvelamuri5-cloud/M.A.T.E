import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '../supabase-client';
import pdfParse from 'pdf-parse';
import { FileProcessor } from './fileProcessor';
import { estimateTokens } from './documents/tokens';
import { isRedactionServiceConfigured, redactTexts } from './documents/redaction';

const DOC_BLOCK_MARKER = '\n\n=== GROUNDING DOCUMENT ===';

/**
 * Fits grounding context into a token budget. The leading profile/settings context is always kept,
 * document blocks are kept in priority order (earlier = higher priority), the first block that
 * overflows is narrowed to its keyword-relevant excerpts (or truncated), and the rest are omitted
 * with a notice naming them.
 */
function fitContextToBudget(context: string, budgetTokens: number, keywords: string[]): string {
  const [head, ...docBlocks] = context.split(DOC_BLOCK_MARKER);
  const budgetChars = Math.max(0, Math.floor(budgetTokens * 3.5));
  let result = head.length > budgetChars ? head.slice(0, budgetChars) : head;
  const omitted: string[] = [];

  for (const rawBlock of docBlocks) {
    const block = DOC_BLOCK_MARKER + rawBlock;
    const remaining = budgetChars - result.length;
    if (omitted.length === 0 && block.length <= remaining) {
      result += block;
      continue;
    }
    const filename = rawBlock.match(/Filename: (.*)/)?.[1]?.trim() || 'Unnamed document';
    if (omitted.length === 0 && remaining > 2000) {
      const narrowed = FileProcessor.extractRelevantChunks(rawBlock, keywords);
      const candidate = narrowed && narrowed.length < rawBlock.length
        ? `${DOC_BLOCK_MARKER}\nFilename: ${filename}\n\nRelevant Excerpts:\n"""\n${narrowed}\n"""\n==========================\n`
        : block;
      result += candidate.length <= remaining
        ? candidate
        : `${candidate.slice(0, remaining - 200)}\n[...truncated to fit the model's context limit]\n"""\n==========================\n`;
      console.log(`[Safety Guard] Narrowed "${filename}" to fit the remaining context budget.`);
      continue;
    }
    omitted.push(filename);
  }

  if (omitted.length > 0) {
    console.warn(`[Safety Guard] Omitted documents to fit context budget: ${omitted.join(', ')}`);
    result += `\n\n[Notice: These documents were omitted because they exceeded the model's context limit: ${omitted.join(', ')}]\n`;
  }
  return result;
}

const CONTINUE_PROMPT = 'Your previous reply was cut off by the length limit. Continue exactly where it stopped. Do not repeat anything already written and do not add a preamble.';
const INCOMPLETE_NOTICE = '\n\n[Notice: This answer reached the maximum length M.A.T.E allows and may be incomplete. Ask for the remaining sections in a follow-up request.]';
// How many extra requests a reply that hit the output limit may use to finish.
const MAX_CONTINUATIONS = 3;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Runs an OpenAI-style chat request and, when the model stops because it ran out of output tokens
 * (finish_reason "length"), asks it to carry on from where it stopped, so long answers such as
 * risk assessments are not sent out cut off mid-sentence.
 */
async function completeWithContinuation(
  label: string,
  messages: ChatMessage[],
  call: (messages: ChatMessage[], round: number) => Promise<{ content: string; finishReason: string }>
): Promise<{ text: string; finishReason: string }> {
  let text = '';
  let finishReason = '';
  for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
    const turn = round === 0
      ? messages
      : [...messages, { role: 'assistant' as const, content: text }, { role: 'user' as const, content: CONTINUE_PROMPT }];
    const res = await call(turn, round);
    text += res.content;
    finishReason = res.finishReason;
    console.log(`[LLM Router] ${label} round ${round + 1}: ${res.content.length} chars, finish_reason=${finishReason || 'n/a'}`);
    if (finishReason !== 'length' || !res.content) break;
  }
  if (finishReason === 'length') {
    console.warn(`[LLM Router] ${label} still hit the output limit after ${MAX_CONTINUATIONS} continuations.`);
    text += INCOMPLETE_NOTICE;
  }
  return { text: text.trim(), finishReason };
}

/**
 * Gemini Service Class
 * Integrates multiple LLM providers (Groq Llama 3.3, Google Gemini, OpenAI, Claude, Perplexity)
 * to clean text, scrub PII, and run grounded maritime inquiries.
 */
export class GeminiService {
  private groq: Groq;
  private ai: GoogleGenAI;

  constructor() {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      console.warn('Warning: GROQ_API_KEY is not defined in environment variables.');
    }
    this.groq = new Groq({ apiKey: groqApiKey || '' });

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.warn('Warning: GEMINI_API_KEY is not defined in environment variables.');
    }
    this.ai = new GoogleGenAI({ apiKey: geminiApiKey || '' });
  }

  /**
   * Helper function to locally scrub common PII patterns before passing to LLM (optional early safety step)
   */
  public scrubPIILocal(text: string): string {
    let scrubbed = text;
    // Scrub emails
    scrubbed = scrubbed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
    // Scrub US phone format and typical phone variations
    scrubbed = scrubbed.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE_REDACTED]');
    // Scrub typical SSN-like or sensitive 9-digit formats
    scrubbed = scrubbed.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ID_REDACTED]');
    return scrubbed;
  }

  /**
   * Cleans text input, scrubs PII, and formats it using Llama 3.1 8B via Groq
   */
  async cleanAndScrubText(rawText: string): Promise<string> {
    // 1. Scrub on our own servers first: the Presidio service when configured (names, addresses,
    //    IDs), otherwise local patterns. Only the scrubbed text is sent to Groq below.
    let preScrubbed = this.scrubPIILocal(rawText);
    if (isRedactionServiceConfigured()) {
      try {
        [preScrubbed] = await redactTexts([rawText]);
      } catch (redactErr) {
        console.error('Redaction service failed, using local scrubbing only:', (redactErr as Error).message);
      }
    }

    try {
      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: `You are a PII scrubbing and text cleanup assistant. Clean, format, and redact any remaining personally identifiable information (PII) such as specific physical addresses, government IDs, and financial information from the text below. Make it professional and clean while preserving the core message. Return only the cleaned text: \n\n${preScrubbed}`
          }
        ]
      });

      return response.choices[0]?.message?.content?.trim() || preScrubbed;
    } catch (error) {
      console.error('Error calling Groq for text cleanup:', error);
      return preScrubbed; // Fallback to local scrubbed version if API fails
    }
  }

  /**
   * Handles contextual search grounding queries by passing reference/grounding files and search instruction
   */
  async runGroundedQuery(
    query: string, 
    referenceContext: string,
    pdfAttachments: Array<{ data: Buffer; mimeType: string; name?: string }> = [],
    systemPrompt?: string,
    llmProvider: string = 'groq',
    agentId?: string
  ): Promise<string> {
    try {
      const activeSystemPrompt = systemPrompt || 
        'You are an agentic maritime representative. Answer the query using the reference maritime data provided.';

      // Extract keywords from query for paragraph pre-filtering
      const stopWords = new Set(['what', 'make', 'vessel', 'please', 'with', 'from', 'about', 'need', 'have', 'does', 'show', 'your', 'were', 'that', 'this', 'there', 'their', 'only', 'also', 'include', 'report', 'send', 'query', 'task', 'run', 'agent']);
      const keywords = query
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

      // Compile any PDF attachments into text and append them to referenceContext
      let parsedPdfContext = '';
      for (const pdf of pdfAttachments) {
        try {
          const parsed = await pdfParse(pdf.data);
          if (parsed?.text) {
            let textToInclude = parsed.text;
            if (textToInclude.length > 25000) {
              textToInclude = FileProcessor.extractRelevantChunks(textToInclude, keywords);
            }
            if (textToInclude) {
              const formattedDocContext = `\n\n=== GROUNDING DOCUMENT ===\nFilename: ${pdf.name || 'Attached PDF Document'}\nClassification: Attached User Document (Reference)\n\nRelevant Excerpts:\n"""\n${textToInclude}\n"""\n==========================\n`;

              // Hard safety budget: stop adding PDFs if the total context would exceed 40,000 characters (~10,000 tokens)
              if (referenceContext.length + parsedPdfContext.length + formattedDocContext.length > 40000) {
                console.log(`[Safety Cap] PDF context limit reached (40k chars). Skipping remaining PDFs.`);
                break;
              }
              parsedPdfContext += formattedDocContext;
            }
          }
        } catch (pdfErr) {
          console.error('Failed to parse PDF attachment with pdf-parse:', (pdfErr as Error).message);
        }
      }

      const fullReferenceContext = `${referenceContext}${parsedPdfContext}`;

      // Build a clearly structured user message that explicitly directs the AI
      // on how to prioritize vessel settings and uploaded company documents
      const buildUserMessage = (groundingContext: string) => `
=== MANDATORY GROUNDING CONTEXT (READ AND APPLY BEFORE RESPONDING) ===

${groundingContext}

=== END OF GROUNDING CONTEXT ===

INSTRUCTIONS FOR USING THE ABOVE CONTEXT:
1. VESSEL SETTINGS: The "Vessel Particulars & Systems" and "Mariner Profile" sections above define this user's specific vessel configuration. You MUST tailor your entire response to this vessel. Do NOT reference equipment, systems, or cargo types that are marked as not applicable (e.g., if Bow Thruster is "Not fitted", do not mention bow thruster operations).

2. COMPANY MANUALS / UPLOADED DOCUMENTS: If any documents are listed above under "=== GROUNDING DOCUMENT ===" with a "Filename", treat them as the PRIMARY reference and FORMAT AUTHORITY.
   - If a document contains a template or structured format, FOLLOW THAT FORMAT for your response.
   - If no document is present, use the format defined in your system directive.

3. PRIORITY ORDER: Company Manual > Vessel Settings > Your General Maritime Knowledge.

4. CITATIONS: You MUST explicitly cite the filenames (e.g. "[02 - SMP.pdf]") in your response whenever you mention guidelines, instructions, or rules sourced from that document. Cite them inline at the end of the sentence or block where they are used.

=== USER QUERY ===
${query}
`.trim();
      const userMessage = buildUserMessage(fullReferenceContext);

      const normalizedProvider = (llmProvider || 'groq').toLowerCase();
      console.log(`[LLM Router] Grounding query using engine provider: ${normalizedProvider}`);

      const baseMessages: ChatMessage[] = [
        { role: 'system', content: activeSystemPrompt },
        { role: 'user', content: userMessage }
      ];

      if (normalizedProvider === 'gemini') {
        const geminiModel = 'gemini-3.5-flash-lite';
        console.log(`[LLM Router] Routing to Gemini model: ${geminiModel}`);

        const { text } = await completeWithContinuation('Gemini', baseMessages, async (messages) => {
          const response = await this.ai.models.generateContent({
            model: geminiModel,
            contents: messages.filter(m => m.role !== 'system').map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            config: {
              systemInstruction: activeSystemPrompt,
              maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 32768
            }
          });
          const reason = String(response.candidates?.[0]?.finishReason || '');
          return { content: response.text || '', finishReason: reason === 'MAX_TOKENS' ? 'length' : reason };
        });
        return text || 'No response generated from Gemini.';

      } else if (normalizedProvider === 'openai' || normalizedProvider === 'perplexity') {
        const isOpenAI = normalizedProvider === 'openai';
        const model = isOpenAI ? 'gpt-4o-mini' : 'sonar';
        const url = isOpenAI ? 'https://api.openai.com/v1/chat/completions' : 'https://api.perplexity.ai/chat/completions';
        const key = isOpenAI ? process.env.OPENAI_API_KEY : process.env.PERPLEXITY_API_KEY;
        console.log(`[LLM Router] Routing to ${isOpenAI ? 'OpenAI' : 'Perplexity'} model: ${model}`);

        const { text } = await completeWithContinuation(isOpenAI ? 'OpenAI' : 'Perplexity', baseMessages, async (messages) => {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model, messages })
          });
          const data = await response.json();
          if (data.error) {
            throw new Error(data.error.message || JSON.stringify(data.error));
          }
          return { content: data.choices?.[0]?.message?.content || '', finishReason: data.choices?.[0]?.finish_reason || '' };
        });
        return text || `No response generated from ${isOpenAI ? 'OpenAI' : 'Perplexity'}.`;

      } else if (normalizedProvider === 'claude') {
        const claudeModel = 'claude-3-5-sonnet-20241022';
        console.log(`[LLM Router] Routing to Anthropic Claude model: ${claudeModel}`);
        const { text } = await completeWithContinuation('Claude', baseMessages, async (messages) => {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': `${process.env.CLAUDE_API_KEY}`,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: claudeModel,
              max_tokens: 8192,
              system: activeSystemPrompt,
              messages: messages.filter(m => m.role !== 'system')
            })
          });
          const data = await response.json();
          if (data.error) {
            throw new Error(data.error.message || JSON.stringify(data.error));
          }
          return { content: data.content?.[0]?.text || '', finishReason: data.stop_reason === 'max_tokens' ? 'length' : (data.stop_reason || '') };
        });
        return text || 'No response generated from Claude.';

      } else if (normalizedProvider === 'sarvam') {
        const sarvamModel = 'sarvam-105b';
        console.log(`[LLM Router] Routing to Sarvam AI model: ${sarvamModel}`);
        console.log(`[LLM Router] Sending Query to Sarvam:`, query);
        
        // [Safety Guard] sarvam-105b has a 128K-token context window shared by prompt and output.
        // Trim lower-priority documents to fit instead of dropping all grounding context.
        // Thinking and the answer share this limit. With 8,192 and the default thinking level, long agent
        // instructions used every token on thinking and the answer came back empty (finish_reason "length").
        const sarvamMaxTokens = Number(process.env.SARVAM_MAX_TOKENS) || 16384;
        const sarvamEffort = process.env.SARVAM_REASONING_EFFORT || 'low';
        const sarvamContextTokens = 128000;
        const promptOverheadTokens = estimateTokens(activeSystemPrompt) + estimateTokens(buildUserMessage('')) + 1000;
        const contextBudgetTokens = sarvamContextTokens - sarvamMaxTokens - promptOverheadTokens;
        let finalUserMessage = userMessage;
        if (estimateTokens(fullReferenceContext) > contextBudgetTokens) {
          console.warn(`[Safety Guard] Grounding context (~${estimateTokens(fullReferenceContext)} tokens) exceeds Sarvam budget (${contextBudgetTokens} tokens). Trimming...`);
          finalUserMessage = buildUserMessage(fitContextToBudget(fullReferenceContext, contextBudgetTokens, keywords));
        }

        const callSarvam = async (messages: ChatMessage[], thinking: boolean) => {
          const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-subscription-key': `${process.env.SARVAM_API_KEY || ''}`
            },
            body: JSON.stringify({
              model: sarvamModel,
              max_tokens: sarvamMaxTokens,
              reasoning_effort: thinking ? sarvamEffort : null,
              temperature: 0.7,
              messages
            })
          });
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Sarvam AI API error (Status ${response.status}): ${errText}`);
          }
          const data = await response.json();
          if (data.error) {
            throw new Error(data.error.message || JSON.stringify(data.error));
          }
          if (data.usage) {
            console.log(`[LLM Router] Sarvam usage: prompt=${data.usage.prompt_tokens} completion=${data.usage.completion_tokens} total=${data.usage.total_tokens}`);
          }
          const choice = data.choices?.[0] || {};
          const content = typeof choice.message?.content === 'string' ? choice.message.content : '';
          const finishReason = choice.finish_reason || '';
          if (!content.trim()) {
            console.warn(`[LLM Router] Sarvam AI returned no answer text (thinking=${thinking}, finish_reason=${finishReason}). Raw payload:`, JSON.stringify(data).slice(0, 2000));
          }
          return { content, finishReason };
        };

        const sarvamMessages: ChatMessage[] = [
          { role: 'system', content: activeSystemPrompt },
          { role: 'user', content: finalUserMessage }
        ];

        // The first request thinks first. If thinking used the whole limit and no answer came back, ask again
        // with thinking off so the whole limit goes to the answer. The model's unfinished thinking is never
        // sent out as the answer: it reads as a reply that stops mid-sentence.
        // Continuations (when the answer itself hits the limit) skip thinking too.
        let usedThinking = true;
        const { text } = await completeWithContinuation('Sarvam', sarvamMessages, async (messages, round) => {
          if (round === 0) {
            const first = await callSarvam(messages, true);
            if (first.content.trim()) return first;
            usedThinking = false;
            return callSarvam(messages, false);
          }
          return callSarvam(messages, false);
        });
        if (!text) {
          throw new Error(`Sarvam AI returned an empty response${usedThinking ? '' : ' twice'}.`);
        }
        return text;

      } else {
        // Fallback or explicit 'groq'. llama-3.1-70b-versatile was retired by Groq.
        const targetModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        console.log(`[LLM Router] Routing to Groq model: ${targetModel}`);
        const { text } = await completeWithContinuation('Groq', baseMessages, async (messages) => {
          const response = await this.groq.chat.completions.create({ model: targetModel, messages });
          return { content: response.choices[0]?.message?.content || '', finishReason: response.choices[0]?.finish_reason || '' };
        });
        return text || 'No response generated.';
      }
    } catch (error) {
      console.error('Error calling LLM for grounded query:', error);
      throw new Error(`Failed to process query with grounding: ${(error as Error).message}`);
    }
  }

  /**
   * Layer 2 — Fuzzy keyword match against analyst-defined agent keywords.
   * Returns the agent ID with the highest keyword match score, or null if no confident match.
   */
  public fuzzyKeywordMatch(
    text: string,
    agents: Array<{ id: string; slot_code?: string; keywords?: string }>
  ): string | null {
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const normText = normalise(text);

    // Simple Levenshtein distance for fuzzy tolerance
    const levenshtein = (a: string, b: string): number => {
      const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
      );
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          dp[i][j] = a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
      return dp[a.length][b.length];
    };

    let bestAgentId: string | null = null;
    let bestScore = 0;

    for (const agent of agents) {
      if (!agent.keywords) continue;
      const keywords = agent.keywords.split(',').map(k => normalise(k)).filter(Boolean);
      let agentScore = 0;

      for (const kw of keywords) {
        if (!kw) continue;
        // Exact substring match — high confidence
        if (normText.includes(kw)) {
          agentScore += 10;
          continue;
        }
        // Word-level fuzzy match — tolerate typos up to 2 chars
        const words = normText.split(/\s+/);
        for (const word of words) {
          if (word.length >= 4 && kw.length >= 4) {
            const dist = levenshtein(word, kw);
            const tolerance = kw.length <= 6 ? 1 : 2;
            if (dist <= tolerance) {
              agentScore += 5;
              break;
            }
          }
        }
      }

      if (agentScore > bestScore) {
        bestScore = agentScore;
        bestAgentId = agent.id;
      }
    }

    // Only return a match if confidence is meaningful (at least one keyword hit)
    return bestScore >= 5 ? bestAgentId : null;
  }

  /**
   * Layer 3 — AI classification with enriched context (slot codes, categories, keywords).
   * Only called if Layer 1 (slot code) and Layer 2 (keyword) routing both fail.
   */
  async classifyQuery(
    query: string,
    agents: Array<{ id: string; name: string; description: string; slot_code?: string; keywords?: string }>
  ): Promise<string> {
    if (agents.length === 0) return '';
    if (agents.length === 1) return agents[0].id;

    try {
      const agentsListString = agents.map(a => {
        const parts = [`ID: "${a.id}"`, `SlotCode: "${a.slot_code || 'N/A'}"`, `Name: "${a.name}"`];
        if (a.keywords) parts.push(`Keywords: "${a.keywords}"`);
        if (a.description) parts.push(`Description: "${a.description}"`);
        return parts.join(', ');
      }).join('\n');

      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: `You are a maritime email routing agent. Classify the incoming maritime inquiry into the single best matching agent.

IMPORTANT RULES:
- You MUST return ONLY the exact Agent UUID — nothing else
- No markdown, no explanation, no quotes — just the raw UUID
- Use the SlotCode, Name, Keywords and Description to match intent
- If genuinely uncertain, return the UUID of the most general maritime agent

Available Agents:
${agentsListString}

Incoming Maritime Inquiry:
${query}`
          }
        ]
      });

      const matchedId = response.choices[0]?.message?.content?.trim() || '';
      return matchedId.replace(/['"` \n\r]/g, '');
    } catch (error) {
      console.error('Error classifying query with Groq:', error);
      return agents[0].id;
    }
  }
}
