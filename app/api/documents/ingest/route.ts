import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { ingestFile, IngestSummary } from '../../../../src/services/documents/ingestion';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Leave headroom under maxDuration for the final status writes.
const TIME_BUDGET_MS = 270_000;

/**
 * POST /api/documents/ingest
 * Body: { fileId } to process one uploaded file, or { backfill: true, limit? } (analysts only)
 * to process files uploaded before ingestion existed. Requires the caller's Supabase access token.
 */
export async function POST(req: NextRequest) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Missing access token' }, { status: 401 });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAnalyst = profile?.role === 'analyst';

  const body = await req.json().catch(() => ({}));

  if (body.backfill) {
    if (!isAnalyst) return NextResponse.json({ error: 'Only analysts can run a backfill' }, { status: 403 });
    const limit = Math.min(Number(body.limit) || 20, 100);
    const { data: pending } = await supabase
      .from('user_files')
      .select('id')
      .or('ingest_status.is.null,ingest_status.eq.failed,ingest_status.eq.queued')
      .neq('file_type', 'letterhead')
      .order('created_at')
      .limit(limit);

    const results: IngestSummary[] = [];
    for (const f of pending || []) {
      if (Date.now() > deadline - 60_000) break;
      results.push(await ingestFile(f.id, deadline));
    }
    const { count: remaining } = await supabase
      .from('user_files')
      .select('id', { count: 'exact', head: true })
      .or('ingest_status.is.null,ingest_status.eq.queued')
      .neq('file_type', 'letterhead');
    return NextResponse.json({ processed: results, remaining: remaining ?? null });
  }

  const fileId = body.fileId;
  if (!fileId) return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });

  const { data: file } = await supabase.from('user_files').select('id, user_id').eq('id', fileId).maybeSingle();
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  if (file.user_id !== user.id && !isAnalyst) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const summary = await ingestFile(fileId, deadline);
  return NextResponse.json(summary, { status: summary.status === 'ready' ? 200 : 500 });
}
