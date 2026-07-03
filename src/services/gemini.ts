import { GoogleGenAI } from '@google/genai';

/**
 * Gemini Service Class
 * Integrates official Google Gen AI SDK to clean text, scrub PII, and handle search grounding.
 */
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('Warning: GEMINI_API_KEY is not defined in environment variables.');
    }
    // Initialize the official Google Gen AI SDK
    this.ai = new GoogleGenAI({ apiKey: apiKey || '' });
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
   * Cleans text input, scrubs PII, and formats it using Gemini
   */
  async cleanAndScrubText(rawText: string): Promise<string> {
    // 1. Local basic scrub first
    const preScrubbed = this.scrubPIILocal(rawText);

    try {
      // 2. Instruct Gemini to thoroughly clean, fix formatting, and verify PII is completely redacted
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are a PII scrubbing and text cleanup assistant. Clean, format, and redact any remaining personally identifiable information (PII) such as specific physical addresses, government IDs, and financial information from the text below. Make it professional and clean while preserving the core message. Return only the cleaned text: \n\n${preScrubbed}`
              }
            ]
          }
        ]
      });

      return response.text?.trim() || preScrubbed;
    } catch (error) {
      console.error('Error calling Gemini for text cleanup:', error);
      return preScrubbed; // Fallback to local scrubbed version if API fails
    }
  }

  /**
   * Handles contextual search grounding queries by passing reference/grounding files and search instruction
   */
  async runGroundedQuery(
    query: string, 
    referenceContext: string,
    pdfAttachments: Array<{ data: Buffer; mimeType: string }> = [],
    systemPrompt?: string
  ): Promise<string> {
    try {
      const activeSystemPrompt = systemPrompt || 
        'You are an agentic maritime representative. Answer the query using the reference maritime data provided. If the answer cannot be found in the context, look it up online using Google Search.';

      // Build a clearly structured user message that explicitly directs the AI
      // on how to prioritize vessel settings and uploaded company documents
      const userMessage = `
=== MANDATORY GROUNDING CONTEXT (READ AND APPLY BEFORE RESPONDING) ===

${referenceContext}

=== END OF GROUNDING CONTEXT ===

INSTRUCTIONS FOR USING THE ABOVE CONTEXT:
1. VESSEL SETTINGS: The "Vessel Particulars & Systems" and "Mariner Profile" sections above define this user's specific vessel configuration. You MUST tailor your entire response to this vessel. Do NOT reference equipment, systems, or cargo types that are marked as not applicable (e.g., if Bow Thruster is "Not fitted", do not mention bow thruster operations).

2. COMPANY MANUALS / UPLOADED DOCUMENTS: If any documents are listed above under "--- Document: [filename] ---", treat them as the PRIMARY reference and FORMAT AUTHORITY.
   - If a document contains a template or structured format, FOLLOW THAT FORMAT for your response.
   - If a document contains company-specific procedures, CITE them in your response using the document name and relevant section/requirement.
   - If no document is present, use the format defined in your system directive.

3. PRIORITY ORDER: Company Manual > Vessel Settings > Your General Maritime Knowledge.

=== USER QUERY ===
${query}
`.trim();

      const parts: any[] = [{ text: userMessage }];

      // Add PDF files directly as inlineData contents
      for (const pdf of pdfAttachments) {
        parts.push({
          inlineData: {
            data: pdf.data.toString('base64'),
            mimeType: pdf.mimeType
          }
        });
      }

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: parts
          }
        ],
        config: {
          systemInstruction: activeSystemPrompt,
          tools: [{ googleSearch: {} }]
        }
      });

      return response.text?.trim() || 'No response generated.';
    } catch (error) {
      console.error('Error calling Gemini for grounded query:', error);
      throw new Error(`Failed to process query with Gemini grounding: ${(error as Error).message}`);
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

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are a maritime email routing agent. Classify the incoming maritime inquiry into the single best matching agent.

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
          }
        ]
      });

      const matchedId = response.text?.trim() || '';
      return matchedId.replace(/['"` \n\r]/g, '');
    } catch (error) {
      console.error('Error classifying query with Gemini:', error);
      return agents[0].id;
    }
  }
}
