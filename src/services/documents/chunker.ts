import { estimateTokens } from './tokens';

/**
 * Document Chunker
 * Turns extracted page text into section-sized chunks: strips repeated headers/footers and
 * contents pages, detects the document's heading structure (numbered, Markdown or chapter-style)
 * and falls back to overlapping fixed-size windows when no structure is found.
 */

export interface DocumentChunk {
  chunkIndex: number;
  headingPath: string;
  pageFrom: number;
  pageTo: number;
  content: string;
  tokenCount: number;
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  structure: 'numbered' | 'markdown' | 'chapter' | 'windows';
  sectionCount: number;
  tokenCount: number;
}

interface Line {
  text: string;
  page: number;
}

interface Heading {
  lineIndex: number;
  level: number;
  title: string;
}

const MAX_SECTION_TOKENS = 3000;
const WINDOW_TOKENS = 1500;
const WINDOW_OVERLAP_TOKENS = 150;
const MIN_HEADINGS = 3;

/**
 * Removes lines that repeat at the top or bottom of most pages (running headers/footers),
 * "Page X of Y" lines and table-of-contents lines with dot leaders.
 */
export function stripBoilerplate(pages: string[]): string[][] {
  const pageLines = pages.map(p => p.replace(/\r/g, '').split('\n'));
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');

  const edgeCounts = new Map<string, number>();
  for (const lines of pageLines) {
    const nonEmpty = lines.filter(l => l.trim());
    const edges = new Set(nonEmpty.slice(0, 3).concat(nonEmpty.slice(-3)).map(normalize));
    for (const e of Array.from(edges)) edgeCounts.set(e, (edgeCounts.get(e) || 0) + 1);
  }
  const repeatThreshold = Math.max(3, Math.ceil(pages.length * 0.5));
  const repeated = new Set(
    pages.length >= 4
      ? Array.from(edgeCounts.entries()).filter(([k, n]) => k && n >= repeatThreshold).map(([k]) => k)
      : []
  );

  return pageLines.map(lines =>
    lines.filter(line => {
      const t = line.trim();
      if (!t) return true;
      if (repeated.has(normalize(t))) return false;
      if (/^page\s+\d+(\s+of\s+\d+)?\b/i.test(t)) return false;
      if (/[.\s_·]{5,}\s*\d+\s*$/.test(t) && /\.{3,}|_{3,}|·{3,}/.test(t)) return false;
      if (/^(table\s+of\s+)?contents$/i.test(t)) return false;
      return true;
    })
  );
}

// --- Heading detection -------------------------------------------------------------------

const NUMBERED_RE = /^(\d{1,3}(?:\.\d{1,3}){0,4})\.?\s+([A-Z(“"'].{1,200})$/;
const MARKDOWN_RE = /^(#{1,6})\s+(\S.{0,200})$/;
const CHAPTER_RE = /^((?:chapter|section|part|annex|appendix)\s+[\dIVXLC]+[A-Z]?\b.{0,150})$/i;

/**
 * True when `next` can follow `prev` in a numbered outline: the next sibling at some level
 * (allowing small skips) or a first child, possibly skipping one level (1 -> 1.1.1).
 */
function isSuccessor(prev: number[], next: number[]): boolean {
  const startsFresh = (nums: number[]) => nums.every(n => n <= 1);
  if (next.length > prev.length && next.length <= prev.length + 2
    && next.slice(0, prev.length).every((n, i) => n === prev.at(i)) && startsFresh(next.slice(prev.length))) {
    return true;
  }
  for (let level = Math.min(prev.length, next.length); level >= 1; level--) {
    const samePrefix = next.slice(0, level - 1).every((n, i) => n === prev.at(i));
    const step = next.at(level - 1)! - prev.at(level - 1)!;
    if (samePrefix && step >= 1 && step <= 3 && startsFresh(next.slice(level))) return true;
  }
  return false;
}

/**
 * Numbered headings are taken as the longest chain of candidates that continue each other's
 * numbering. Numbered paragraphs quoted inside body text (e.g. "12.7 The management..." or an
 * ISM clause "2.3 ..." inside question 2.2.3) break the chain and are left as body text.
 */
function detectNumbered(lines: Line[]): Heading[] {
  const candidates: Array<{ lineIndex: number; nums: number[]; title: string }> = [];
  lines.forEach((line, lineIndex) => {
    const m = line.text.trim().match(NUMBERED_RE);
    if (m) candidates.push({ lineIndex, nums: m[1].split('.').map(Number), title: `${m[1]} ${m[2].trim()}` });
  });

  const LOOKBACK = 60;
  const best: number[] = candidates.map(c => (c.nums[0] <= 3 && c.nums.slice(1).every(n => n <= 1) ? 1 : 0));
  const from = candidates.map(() => -1);
  for (let i = 0; i < candidates.length; i++) {
    for (let j = Math.max(0, i - LOOKBACK); j < i; j++) {
      if (best[j] > 0 && best[j] + 1 > best[i] && isSuccessor(candidates[j].nums, candidates[i].nums)) {
        best[i] = best[j] + 1;
        from[i] = j;
      }
    }
  }

  let end = -1;
  best.forEach((b, i) => { if (b > 0 && (end < 0 || b > best[end])) end = i; });
  const chain: Heading[] = [];
  for (let i = end; i >= 0; i = from[i]) {
    const c = candidates[i];
    chain.unshift({ lineIndex: c.lineIndex, level: c.nums.length, title: c.title });
  }
  return chain;
}

function detectMarkdown(lines: Line[]): Heading[] {
  const headings: Heading[] = [];
  lines.forEach((line, lineIndex) => {
    const m = line.text.trim().match(MARKDOWN_RE);
    if (m) headings.push({ lineIndex, level: m[1].length, title: m[2].trim() });
  });
  return headings;
}

function detectChapters(lines: Line[]): Heading[] {
  const headings: Heading[] = [];
  lines.forEach((line, lineIndex) => {
    const t = line.text.trim();
    if (t.length < 160 && CHAPTER_RE.test(t)) headings.push({ lineIndex, level: 1, title: t });
  });
  return headings;
}

// --- Chunk assembly ------------------------------------------------------------------------

function splitLargeSection(lines: Line[], headingLine: string, path: string): Omit<DocumentChunk, 'chunkIndex'>[] {
  const parts: Omit<DocumentChunk, 'chunkIndex'>[] = [];
  let current: Line[] = [];
  let currentTokens = 0;
  const flush = (continued: boolean) => {
    const body = current.map(l => l.text).join('\n').trim();
    if (!body) return;
    const content = continued ? `${headingLine} (continued)\n${body}` : body;
    parts.push({
      headingPath: path,
      pageFrom: current[0].page,
      pageTo: current.at(-1)!.page,
      content,
      tokenCount: estimateTokens(content),
    });
  };
  for (const line of lines) {
    const t = estimateTokens(line.text) + 1;
    // Prefer to break on a blank line once the part is reasonably full.
    const atParagraphBreak = !line.text.trim() && currentTokens >= WINDOW_TOKENS;
    if (current.length > 0 && (atParagraphBreak || currentTokens + t > MAX_SECTION_TOKENS)) {
      flush(parts.length > 0);
      current = [];
      currentTokens = 0;
      if (!line.text.trim()) continue;
    }
    current.push(line);
    currentTokens += t;
  }
  if (current.length > 0) flush(parts.length > 0);
  return parts;
}

function chunkBySections(lines: Line[], headings: Heading[]): Omit<DocumentChunk, 'chunkIndex'>[] {
  const chunks: Omit<DocumentChunk, 'chunkIndex'>[] = [];
  const stack: Heading[] = [];

  // Text before the first heading (cover page, preamble).
  const preamble = lines.slice(0, headings[0]?.lineIndex ?? lines.length);
  if (preamble.some(l => l.text.trim())) chunks.push(...splitLargeSection(preamble, 'Preamble', 'Preamble'));

  headings.forEach((heading, i) => {
    while (stack.length && stack.at(-1)!.level >= heading.level) stack.pop();
    stack.push(heading);
    const end = headings[i + 1]?.lineIndex ?? lines.length;
    const sectionLines = lines.slice(heading.lineIndex, end);
    const hasBody = sectionLines.slice(1).some(l => l.text.trim());
    if (!hasBody) return; // A heading followed directly by a sub-heading only contributes to the path.
    const path = stack.map(h => h.title.slice(0, 100)).join(' > ');
    chunks.push(...splitLargeSection(sectionLines, sectionLines[0].text.trim(), path));
  });
  return chunks;
}

function chunkByWindows(lines: Line[]): Omit<DocumentChunk, 'chunkIndex'>[] {
  const chunks: Omit<DocumentChunk, 'chunkIndex'>[] = [];
  let start = 0;
  while (start < lines.length) {
    let tokens = 0;
    let end = start;
    while (end < lines.length && tokens < WINDOW_TOKENS) {
      tokens += estimateTokens(lines[end].text) + 1;
      end++;
    }
    const slice = lines.slice(start, end);
    const content = slice.map(l => l.text).join('\n').trim();
    if (content) {
      chunks.push({
        headingPath: `Pages ${slice[0].page}–${slice.at(-1)!.page}`,
        pageFrom: slice[0].page,
        pageTo: slice.at(-1)!.page,
        content,
        tokenCount: estimateTokens(content),
      });
    }
    if (end >= lines.length) break;
    // Step back to overlap the next window with the end of this one.
    let back = end;
    let overlap = 0;
    while (back > start + 1 && overlap < WINDOW_OVERLAP_TOKENS) {
      back--;
      overlap += estimateTokens(lines[back].text) + 1;
    }
    start = back;
  }
  return chunks;
}

/**
 * Chunks a document given its text per page (1 entry for formats without pages).
 */
export function chunkDocument(pages: string[], fileExt: string = ''): ChunkingResult {
  const cleanedPages = stripBoilerplate(pages);
  const lines: Line[] = [];
  cleanedPages.forEach((pageLines, i) => {
    for (const text of pageLines) lines.push({ text: text.replace(/\t/g, '    ').replace(/[ ]{2,}/g, ' '), page: i + 1 });
  });

  const candidates: Array<[ChunkingResult['structure'], Heading[]]> = [
    ['markdown', fileExt === 'md' ? detectMarkdown(lines) : []],
    ['numbered', detectNumbered(lines)],
    ['chapter', detectChapters(lines)],
  ];
  const found = candidates.find(([, h]) => h.length >= MIN_HEADINGS);

  const structure = found ? found[0] : 'windows';
  const raw = found ? chunkBySections(lines, found[1]) : chunkByWindows(lines);
  const chunks = raw.map((c, chunkIndex) => ({ ...c, chunkIndex }));
  return {
    chunks,
    structure,
    sectionCount: found ? found[1].length : chunks.length,
    tokenCount: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
  };
}
