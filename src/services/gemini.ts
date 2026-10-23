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

      if (normalizedProvider === 'gemini') {
        const geminiModel = 'gemini-3.5-flash-lite';
        console.log(`[LLM Router] Routing to Gemini model: ${geminiModel}`);

        const response = await this.ai.models.generateContent({
          model: geminiModel,
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          config: { systemInstruction: activeSystemPrompt }
        });
        return response.text?.trim() || 'No response generated from Gemini.';
      } else if (normalizedProvider === 'openai') {
        const openaiModel = 'gpt-4o-mini';
        console.log(`[LLM Router] Routing to OpenAI model: ${openaiModel}`);
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: openaiModel,
            messages: [
              { role: 'system', content: activeSystemPrompt },
              { role: 'user', content: userMessage }
            ]
          })
        });
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error.message || JSON.stringify(data.error));
        }
        return data.choices[0]?.message?.content?.trim() || 'No response generated from OpenAI.';

      } else if (normalizedProvider === 'claude') {
        const claudeModel = 'claude-3-5-sonnet-20241022';
        console.log(`[LLM Router] Routing to Anthropic Claude model: ${claudeModel}`);
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': `${process.env.CLAUDE_API_KEY}`,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: claudeModel,
            max_tokens: 4000,
            system: activeSystemPrompt,
            messages: [{ role: 'user', content: userMessage }]
          })
        });
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error.message || JSON.stringify(data.error));
        }
        return data.content[0]?.text?.trim() || 'No response generated from Claude.';

      } else if (normalizedProvider === 'perplexity') {
        const perplexityModel = 'sonar';
        console.log(`[LLM Router] Routing to Perplexity model: ${perplexityModel}`);
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
          },
          body: JSON.stringify({
            model: perplexityModel,
            messages: [
              { role: 'system', content: activeSystemPrompt },
              { role: 'user', content: userMessage }
            ]
          })
        });
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error.message || JSON.stringify(data.error));
        }
        return data.choices[0]?.message?.content?.trim() || 'No response generated from Perplexity.';

      } else if (normalizedProvider === 'sarvam') {
        const sarvamModel = 'sarvam-105b';
        console.log(`[LLM Router] Routing to Sarvam AI model: ${sarvamModel}`);
        console.log(`[LLM Router] Sending Query to Sarvam:`, query);
        
        // [Safety Guard] sarvam-105b has a 128K-token context window shared by prompt and output.
        // Trim lower-priority documents to fit instead of dropping all grounding context.
        const sarvamMaxTokens = Number(process.env.SARVAM_MAX_TOKENS) || 8192;
        const sarvamContextTokens = 128000;
        const promptOverheadTokens = estimateTokens(activeSystemPrompt) + estimateTokens(buildUserMessage('')) + 1000;
        const contextBudgetTokens = sarvamContextTokens - sarvamMaxTokens - promptOverheadTokens;
        let finalUserMessage = userMessage;
        if (estimateTokens(fullReferenceContext) > contextBudgetTokens) {
          console.warn(`[Safety Guard] Grounding context (~${estimateTokens(fullReferenceContext)} tokens) exceeds Sarvam budget (${contextBudgetTokens} tokens). Trimming...`);
          finalUserMessage = buildUserMessage(fitContextToBudget(fullReferenceContext, contextBudgetTokens, keywords));
        }

        // An empty reply is retried once, then treated as a failure so the run is refunded and logged as Failed
        // instead of being saved as a "completed" answer that says nothing.
        let finishReason = '';
        for (let attempt = 1; attempt <= 2; attempt++) {
          const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-subscription-key': `${process.env.SARVAM_API_KEY || ''}`
            },
            body: JSON.stringify({
              model: sarvamModel,
              max_tokens: sarvamMaxTokens,
              temperature: 0.7,
              messages: [
                { role: 'system', content: activeSystemPrompt },
                { role: 'user', content: finalUserMessage }
              ]
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
          const messageObj = choice.message || {};
          const content = (typeof messageObj.content === 'string' ? messageObj.content : '').trim();
          const reasoning = (messageObj.reasoning_content || messageObj.reasoning || '').trim();
          finishReason = choice.finish_reason || '';

          // If content is null (because it hit length limit while reasoning), return reasoning
          if (content || reasoning) return content || reasoning;
          console.warn(`[LLM Router] Sarvam AI returned an empty response (attempt ${attempt}, finish_reason=${finishReason}). Raw payload:`, JSON.stringify(data).slice(0, 2000));
        }
        throw new Error(`Sarvam AI returned an empty response twice${finishReason ? ` (finish_reason: ${finishReason})` : ''}.`);

      } else {
        // Fallback or explicit 'groq'
        const targetModel = 'llama-3.1-70b-versatile';
        console.log(`[LLM Router] Routing to Groq model: ${targetModel}`);
        const response = await this.groq.chat.completions.create({
          model: targetModel,
          messages: [
            { role: 'system', content: activeSystemPrompt },
            { role: 'user', content: userMessage }
          ]
        });
        return response.choices[0]?.message?.content?.trim() || 'No response generated.';
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
