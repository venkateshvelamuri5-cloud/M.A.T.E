import { PDFDocument } from 'pdf-lib';

/**
 * OCR for scanned PDF pages using Sarvam Document AI (digitise). Sarvam accepts at most
 * 10 pages per job, so image-only pages are copied into 10-page PDFs and processed as
 * parallel asynchronous jobs.
 */

const SARVAM_DOC_AI_URL = 'https://api.sarvam.ai/doc-ai/v1/job';
const PAGES_PER_JOB = 10;
const MAX_PARALLEL_JOBS = 4;
const POLL_INTERVAL_MS = 5000;
const TERMINAL_STATUSES = new Set(['completed', 'partially_completed', 'failed', 'rejected']);

export interface OcrResult {
  /** OCR text keyed by 0-based page index of the original PDF. */
  pages: Map<number, string>;
  failedPageIndexes: number[];
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function sarvamHeaders(): Record<string, string> {
  return { 'api-subscription-key': process.env.SARVAM_API_KEY || '' };
}

async function digitiseBatch(pdfBytes: Uint8Array, deadline: number): Promise<Map<number, string>> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }), 'pages.pdf');
  form.append('language', process.env.SARVAM_DOC_LANGUAGE || 'en-IN');

  const startRes = await fetch(`${SARVAM_DOC_AI_URL}/digitise`, { method: 'POST', headers: sarvamHeaders(), body: form });
  if (!startRes.ok) throw new Error(`Sarvam digitise failed (Status ${startRes.status}): ${await startRes.text()}`);
  const { job_id: jobId } = await startRes.json();

  let status = '';
  while (!TERMINAL_STATUSES.has(status)) {
    if (Date.now() > deadline) throw new Error(`Sarvam digitise job ${jobId} did not finish before the deadline`);
    await sleep(POLL_INTERVAL_MS);
    const statusRes = await fetch(`${SARVAM_DOC_AI_URL}/${encodeURIComponent(jobId)}/status`, { headers: sarvamHeaders() });
    if (!statusRes.ok) throw new Error(`Sarvam status check failed (Status ${statusRes.status})`);
    status = (await statusRes.json()).status;
  }
  if (status === 'failed' || status === 'rejected') throw new Error(`Sarvam digitise job ${jobId} ${status}`);

  const resultsRes = await fetch(`${SARVAM_DOC_AI_URL}/${encodeURIComponent(jobId)}/results?format=md`, { headers: sarvamHeaders() });
  if (!resultsRes.ok) throw new Error(`Sarvam results failed (Status ${resultsRes.status})`);
  const results = await resultsRes.json();

  // Keyed by 1-based page number within this batch PDF.
  const byPage = new Map<number, string>();
  for (const doc of results.documents || []) {
    for (const page of doc.pages || []) {
      if (typeof page.page_number === 'number' && page.content) byPage.set(page.page_number, page.content);
    }
  }
  return byPage;
}

export function isOcrConfigured(): boolean {
  return Boolean(process.env.SARVAM_API_KEY) && process.env.SARVAM_OCR_ENABLED !== 'false';
}

export async function ocrPdfPages(pdfBuffer: Buffer, pageIndexes: number[], deadline: number): Promise<OcrResult> {
  const result: OcrResult = { pages: new Map(), failedPageIndexes: [] };
  if (pageIndexes.length === 0) return result;

  const source = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const batches: number[][] = [];
  for (let i = 0; i < pageIndexes.length; i += PAGES_PER_JOB) batches.push(pageIndexes.slice(i, i + PAGES_PER_JOB));

  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(source, batch);
        copied.forEach(page => out.addPage(page));
        const byPage = await digitiseBatch(await out.save(), deadline);
        batch.forEach((originalIndex, i) => {
          const text = byPage.get(i + 1);
          if (text) result.pages.set(originalIndex, text);
          else result.failedPageIndexes.push(originalIndex);
        });
      } catch (err) {
        console.error(`[OCR] Batch of pages ${batch[0] + 1}-${batch.at(-1)! + 1} failed:`, (err as Error).message);
        result.failedPageIndexes.push(...batch);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_JOBS, batches.length) }, worker));
  result.failedPageIndexes.sort((a, b) => a - b);
  return result;
}
