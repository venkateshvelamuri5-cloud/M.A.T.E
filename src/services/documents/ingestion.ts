import { createHash } from 'crypto';
import { supabase } from '../../supabase-client';
import { chunkDocument } from './chunker';
import { extractDocument, fileExtensionOf } from './extraction';
import { isOcrConfigured, ocrPdfPages } from './ocr';
import { redactTexts } from './redaction';

/**
 * Document Ingestion Service
 * Processes an uploaded file once: download, hash, extract (with OCR for scanned pages),
 * chunk by section, redact PII for user documents, and store the chunks for retrieval.
 */

export interface IngestSummary {
  fileId: string;
  status: 'ready' | 'failed';
  reusedFrom?: string;
  pageCount?: number;
  tokenCount?: number;
  sectionCount?: number;
  structure?: string;
  ocrPageCount?: number;
  error?: string;
}

const INSERT_BATCH = 200;

export function isKnowledgeBaseFile(file: any): boolean {
  return file.file_type === 'knowledge_base' || Boolean(file.agent_id) || file.user_id === '00000000-0000-0000-0000-000000000000';
}

export function storageBucketFor(file: any): string {
  return isKnowledgeBaseFile(file) ? 'knowledge-base' : 'user-spaces';
}

/** User documents are redacted by default; knowledge base files only when an analyst opts in. */
export function shouldRedact(file: any): boolean {
  return file.redact_pii ?? !isKnowledgeBaseFile(file);
}

async function updateFile(fileId: string, fields: Record<string, any>) {
  const { error } = await supabase.from('user_files').update(fields).eq('id', fileId);
  if (error) console.error(`[Ingestion] Failed to update file ${fileId}:`, error.message);
}

/**
 * Finds an already processed copy of the same bytes that this file may reuse: a knowledge base
 * file, or one of the same user's own files. Another user's private file is never reused.
 */
async function findReusableCopy(file: any, contentHash: string): Promise<any | null> {
  const { data } = await supabase
    .from('user_files')
    .select('id, user_id, file_type, agent_id, page_count, token_count, section_count, chunk_structure, ocr_page_count, pii_redacted')
    .eq('content_hash', contentHash)
    .eq('ingest_status', 'ready')
    .neq('id', file.id);
  const candidates = (data || []).filter(c => isKnowledgeBaseFile(c) || c.user_id === file.user_id);
  // Prefer a copy whose redaction matches what this file needs.
  const needsRedaction = shouldRedact(file);
  return candidates.find(c => Boolean(c.pii_redacted) === needsRedaction)
    || candidates.find(c => isKnowledgeBaseFile(c))
    || null;
}

export async function ingestFile(fileId: string, deadline: number = Date.now() + 240_000): Promise<IngestSummary> {
  const { data: file, error: fileErr } = await supabase.from('user_files').select('*').eq('id', fileId).maybeSingle();
  if (fileErr || !file) return { fileId, status: 'failed', error: fileErr?.message || 'File not found' };

  await updateFile(fileId, { ingest_status: 'processing', ingest_error: null });

  try {
    const { data: blob, error: downloadErr } = await supabase.storage.from(storageBucketFor(file)).download(file.storage_path);
    if (downloadErr || !blob) throw new Error(`Download failed: ${downloadErr?.message || 'empty file'}`);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    await supabase.from('document_chunks').delete().eq('file_id', fileId);

    // 1. Identical file already processed: copy its chunks instead of processing again.
    const reusable = await findReusableCopy(file, contentHash);
    if (reusable && !(shouldRedact(file) && !reusable.pii_redacted && !isKnowledgeBaseFile(reusable))) {
      const { error: copyErr } = await supabase.rpc('copy_document_chunks', { p_source_file_id: reusable.id, p_target_file_id: fileId });
      if (copyErr) throw new Error(`Copying chunks failed: ${copyErr.message}`);
      await updateFile(fileId, {
        ingest_status: 'ready',
        ingested_at: new Date().toISOString(),
        content_hash: contentHash,
        page_count: reusable.page_count,
        token_count: reusable.token_count,
        section_count: reusable.section_count,
        chunk_structure: reusable.chunk_structure,
        ocr_page_count: reusable.ocr_page_count,
        pii_redacted: Boolean(reusable.pii_redacted),
      });
      console.log(`[Ingestion] "${file.name}" reused chunks from identical file ${reusable.id}`);
      return { fileId, status: 'ready', reusedFrom: reusable.id, pageCount: reusable.page_count, tokenCount: reusable.token_count, sectionCount: reusable.section_count };
    }

    // 2. Extract text, with OCR for image-only PDF pages.
    const ext = fileExtensionOf(file);
    const extracted = await extractDocument(buffer, ext);
    let ocrPageCount = 0;
    let ingestNote: string | null = null;
    if (ext === 'pdf' && extracted.imagePageIndexes.length > 0) {
      if (isOcrConfigured()) {
        const ocr = await ocrPdfPages(buffer, extracted.imagePageIndexes, deadline);
        ocr.pages.forEach((text, index) => { extracted.pages[index] = text; });
        ocrPageCount = ocr.pages.size;
        if (ocr.failedPageIndexes.length > 0) ingestNote = `OCR failed for ${ocr.failedPageIndexes.length} scanned page(s)`;
      } else {
        ingestNote = `${extracted.imagePageIndexes.length} page(s) look scanned and were skipped (OCR is not configured)`;
      }
    }

    // 3. Chunk by section.
    const result = chunkDocument(extracted.pages, ext);
    if (result.chunks.length === 0) throw new Error('No text could be extracted from this file');

    // 4. Redact PII before anything is stored.
    const redact = shouldRedact(file);
    let rows = result.chunks.map(c => ({
      file_id: fileId,
      chunk_index: c.chunkIndex,
      heading_path: c.headingPath,
      page_from: c.pageFrom,
      page_to: c.pageTo,
      content: c.content,
      token_count: c.tokenCount,
    }));
    if (redact) {
      const redacted = await redactTexts(rows.flatMap(r => [r.heading_path, r.content]));
      rows = rows.map((r, i) => ({ ...r, heading_path: redacted[2 * i], content: redacted[2 * i + 1] }));
    }

    // 5. Store.
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const { error: insertErr } = await supabase.from('document_chunks').insert(rows.slice(i, i + INSERT_BATCH));
      if (insertErr) throw new Error(`Saving chunks failed: ${insertErr.message}`);
    }

    await updateFile(fileId, {
      ingest_status: 'ready',
      ingest_error: ingestNote,
      ingested_at: new Date().toISOString(),
      content_hash: contentHash,
      page_count: extracted.pages.length,
      token_count: result.tokenCount,
      section_count: result.sectionCount,
      chunk_structure: result.structure,
      ocr_page_count: ocrPageCount,
      pii_redacted: redact,
    });
    console.log(`[Ingestion] "${file.name}": ${extracted.pages.length} pages, ${result.chunks.length} chunks (${result.structure}), ~${result.tokenCount} tokens`);
    return {
      fileId,
      status: 'ready',
      pageCount: extracted.pages.length,
      tokenCount: result.tokenCount,
      sectionCount: result.sectionCount,
      structure: result.structure,
      ocrPageCount,
    };
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[Ingestion] Failed for "${file.name}":`, message);
    await supabase.from('document_chunks').delete().eq('file_id', fileId);
    await updateFile(fileId, { ingest_status: 'failed', ingest_error: message });
    return { fileId, status: 'failed', error: message };
  }
}
