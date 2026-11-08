import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { rankByCode } from '../../../../src/crew/ranks';

export const dynamic = 'force-dynamic';

// Ship leads for analysts: each ship an officer has linked to, whether its Master is on M.A.T.E
// yet, and who on board already uses it. Vessels have no client policies, so this reads them
// with the server key after checking the caller is an analyst.

const STATUSES = ['new', 'contacted', 'signed_up', 'not_interested'] as const;

async function requireAnalyst(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return profile?.role === 'analyst' ? user : null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAnalyst(req))) return NextResponse.json({ error: 'Only analysts can see ship leads.' }, { status: 403 });

  const { data: vessels, error } = await supabase.from('vessels').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: `Couldn't load ships: ${error.message}` }, { status: 500 });
  if (!vessels?.length) return NextResponse.json({ leads: [] });

  const ids = vessels.map(v => v.id);
  const masterEmails = vessels.map(v => v.master_email);
  const [{ data: members }, { data: masters }] = await Promise.all([
    supabase.from('vessel_members').select('vessel_id, user_id, rank_code, status, created_at').in('vessel_id', ids).in('status', ['pending', 'active']),
    supabase.from('profiles').select('id, full_name, vessel_email').in('vessel_email', masterEmails)
  ]);
  const userIds = Array.from(new Set((members || []).map(m => m.user_id)));
  const { data: people } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string; company_name: string | null }[] };

  const leads = vessels.map(v => {
    const crew = (members || []).filter(m => m.vessel_id === v.id).map(m => {
      const p = (people || []).find(x => x.id === m.user_id);
      return {
        name: p?.full_name || 'Officer',
        email: p?.email || '',
        company: p?.company_name || null,
        rank: rankByCode(m.rank_code)?.label || m.rank_code,
        status: m.status as 'pending' | 'active'
      };
    });
    const masterProfile = (masters || []).find(p => p.vessel_email === v.master_email);
    const masterMember = (members || []).some(m => m.vessel_id === v.id && m.rank_code === 'MS' && m.status === 'active');
    const companies = Array.from(new Set(crew.map(c => c.company).filter(Boolean))) as string[];
    return {
      id: v.id,
      vesselName: v.name,
      imo: v.imo,
      masterEmail: v.master_email,
      createdAt: v.created_at,
      setupComplete: !!v.setup_completed_at,
      masterOnMate: !!masterProfile || masterMember,
      masterName: masterProfile?.full_name || null,
      companies,
      crew,
      leadStatus: v.lead_status || 'new',
      leadNote: v.lead_note || '',
      leadUpdatedAt: v.lead_updated_at || null
    };
  });
  return NextResponse.json({ leads });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAnalyst(req))) return NextResponse.json({ error: 'Only analysts can update ship leads.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  const patch: Record<string, unknown> = { lead_updated_at: new Date().toISOString() };
  if (body.leadStatus !== undefined) {
    if (!STATUSES.includes(body.leadStatus)) return NextResponse.json({ error: 'Unknown lead status.' }, { status: 400 });
    patch.lead_status = body.leadStatus;
  }
  if (body.leadNote !== undefined) patch.lead_note = String(body.leadNote).slice(0, 2000) || null;
  const { error } = await supabase.from('vessels').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: `Couldn't save: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
