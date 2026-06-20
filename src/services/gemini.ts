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
  async runGroundedQuery(query: string, referenceContext: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are an agentic business representative. Answer the query using the reference company data below. If the answer cannot be found in the context, state that clearly.\n\nContext:\n${referenceContext}\n\nQuery:\n${query}`
              }
            ]
          }
        ]
      });

      return response.text?.trim() || 'No response generated.';
    } catch (error) {
      console.error('Error calling Gemini for grounded query:', error);
      throw new Error(`Failed to process query with Gemini grounding: ${(error as Error).message}`);
    }
  }
}
