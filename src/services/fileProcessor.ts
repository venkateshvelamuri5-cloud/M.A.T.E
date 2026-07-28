/**
 * File Processor Service
 * Formats context files into clean Markdown, removes whitespaces, and filters out common boilerplates (TOC, Revision logs, headers/footers)
 * to optimize token usage without losing semantic content quality.
 */
export class FileProcessor {
  private static textHashes = new Set<string>();

  /**
   * Cleans raw text: converts to clean Markdown structure, removes whitespaces, and strips boilerplates.
   */
  public static cleanToMarkdown(text: string, filename: string = ''): string {
    if (!text) return '';

    // 1. Deduplicate check - prevent duplicate blocks of text
    const textHash = this.hashCode(text.trim().substring(0, 1000));
    if (this.textHashes.has(textHash)) {
      console.log(`[FileProcessor] Duplicate text section skipped for: ${filename}`);
      return '';
    }
    this.textHashes.add(textHash);

    let cleaned = text;

    // 2. Boilerplate Stripper
    // Remove Table of Contents (TOC) patterns (e.g., lines ending with multiple dots or page numbers)
    cleaned = cleaned.replace(/^.*[.\s_]{5,}\s*\d+\s*$/gm, '');
    cleaned = cleaned.replace(/^.*table\s+of\s+contents.*$/gim, '');
    
    // Remove repeating page headers/footers (e.g. "Page X of Y", "SMS Vol. X", etc.)
    cleaned = cleaned.replace(/^\s*page\s+\d+\s+(of\s+\d+)?\s*$/gim, '');
    cleaned = cleaned.replace(/^\s*doc(ument)?\s+code\s*:\s*[A-Z0-9-]+\s*$/gim, '');
    cleaned = cleaned.replace(/^\s*revision\s*(status|date|history)\s*:.*$/gim, '');
    
    // Remove typical legal boilerplate disclaimers (e.g., copyright lines)
    cleaned = cleaned.replace(/^.*©\s*\d{4}\s+[A-Za-z0-9\s,.]+all\s+rights\s+reserved.*$/gim, '');

    // 3. Markdown Formatter & Whitespace Compressor
    // Clean up Windows carriage returns and tab spacings
    cleaned = cleaned.replace(/\r/g, '');
    cleaned = cleaned.replace(/\t/g, '    ');

    // Compress consecutive blank lines (limit to max 1 blank line between sections)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Compress excessive spaces
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

    // Normalize markdown bullets for lists
    cleaned = cleaned.replace(/^\s*[\u2022\u00b7\u25cf]\s*/gm, '- ');

    return cleaned.trim();
  }

  /**
   * Reset the duplicate detector hashes (called at the beginning of each query run).
   */
  public static resetCache(): void {
    this.textHashes.clear();
  }

  /**
   * Simple string hash generator
   */
  private static hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Extracts only the paragraphs containing the keywords and their immediate surrounding context (preceding/succeeding paragraphs)
   * to implement lightweight paragraph-level RAG.
   */
  public static extractRelevantChunks(text: string, keywords: string[]): string {
    if (!text) return '';
    if (!keywords || keywords.length === 0) return text;

    const paragraphs = text.split(/\n\n+/);
    const scoredParagraphs: Array<{ index: number; score: number }> = [];

    // 1. Score each paragraph based on keyword term frequency (TF)
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i].toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (p.includes(kw)) {
          // Count keyword occurrences in the paragraph
          const occurrences = p.split(kw).length - 1;
          score += occurrences;
        }
      }
      if (score > 0) {
        scoredParagraphs.push({ index: i, score });
      }
    }

    if (scoredParagraphs.length === 0) {
      return '';
    }

    // 2. Sort paragraphs by score descending and take the top 5 most relevant paragraphs
    scoredParagraphs.sort((a, b) => b.score - a.score);
    const topParagraphs = scoredParagraphs.slice(0, 5);

    // 3. Collect indices and include 1 paragraph of surrounding context for readability
    const matchedIndices = new Set<number>();
    for (const item of topParagraphs) {
      matchedIndices.add(item.index);
      if (item.index > 0) matchedIndices.add(item.index - 1);
      if (item.index < paragraphs.length - 1) matchedIndices.add(item.index + 1);
    }

    // 4. Sort indices to print matched segments in their original document chronological order
    const sortedIndices = Array.from(matchedIndices).sort((a, b) => a - b);
    return sortedIndices.map(idx => paragraphs[idx].trim()).join('\n\n');
  }
}
