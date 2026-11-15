import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { rankByCode } from '../../../../src/crew/ranks';
import { activeMember, vesselById, VesselMember } from '../../../../src/crew/vessels';
import { approveMember } from '../../../../src/crew/approval';
import { siteOrigin } from '../../../../src/crew/origin';

export const dynamic = 'force-dynamic';

// The Master's one-click approval. The link was emailed to the Master's address, so holding the
// token shows the Master (or someone at their mailbox) agrees. Masters who can't open the site
// reply APPROVE to the email instead (src/crew/approval.ts). GET only reads, so link scanners
// that open URLs in email can't approve anything; the page's button POSTs.

async function load(token: string) {
  if (!token || token.length < 32) return null;
  const { data } = await supabase.from('vessel_members').select('*').eq('approval_token', token).maybeSingle();
  const member = data as VesselMember | null;
  if (!member) return null;
  const vessel = await vesselById(member.vessel_id);
  if (!vessel) return null;
  const { data: officer } = await supabase.from('profiles').select('full_name, email').eq('id', member.user_id).maybeSingle();
  const current = await activeMember(vessel.id, member.rank_code);
  let previousOfficer: string | null = null;
  if (current && current.id !== member.id) {
    const { data: prev } = await supabase.from('profiles').select('full_name').eq('id', current.user_id).maybeSingle();
    previousOfficer = prev?.full_name || 'another officer';
  }
  return { member, vessel, officer, current, previousOfficer };
}

function view(found: NonNullable<Awaited<ReturnType<typeof load>>>) {
  const { member, vessel, officer, previousOfficer } = found;
  return {
    status: member.status,
    officerName: officer?.full_name || 'An officer',
    officerEmail: officer?.email || '',
    rankLabel: rankByCode(member.rank_code)?.label || member.rank_code,
    isMaster: member.rank_code === 'MS',
    vesselName: vessel.name,
    masterEmail: vessel.master_email,
    previousOfficer,
    setupComplete: !!vessel.setup_completed_at,
    setupPath: `/ship-setup/${vessel.setup_token}`
  };
}

export async function GET(req: NextRequest) {
  const found = await load(req.nextUrl.searchParams.get('token') || '');
  if (!found) return NextResponse.json({ error: 'This approval link is not valid.' }, { status: 404 });
  return NextResponse.json(view(found));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const found = await load(String(body.token || ''));
  if (!found) return NextResponse.json({ error: 'This approval link is not valid.' }, { status: 404 });
  const { member, vessel } = found;
  const result = await approveMember(member, vessel, siteOrigin(req));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: member.status === 'removed' ? 409 : 500 });
  }
  const after = await load(String(body.token));
  return NextResponse.json(after ? view(after) : { status: 'active' });
}
