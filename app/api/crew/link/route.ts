import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { userFromRequest } from '../../../../src/services/limits';
import { rankByCode, subjectCode } from '../../../../src/crew/ranks';
import { endMembership, normalizeEmail, openMembership, vesselById, VesselMember, vesselRanks } from '../../../../src/crew/vessels';
import { LinkResult, requestLink } from '../../../../src/crew/link';
import { siteOrigin } from '../../../../src/crew/origin';

export const dynamic = 'force-dynamic';

// The officer's link to a ship: GET shows it, POST links (or re-sends the Master's approval), DELETE unlinks.

async function describe(member: VesselMember | null) {
  if (!member) return { link: null };
  const vessel = await vesselById(member.vessel_id);
  if (!vessel) return { link: null };
  const rank = rankByCode(member.rank_code);
  const row = (await vesselRanks(vessel.id)).find(r => r.rank_code === member.rank_code);
  return {
    link: {
      status: member.status,
      rankCode: member.rank_code,
      rankLabel: rank?.label || member.rank_code,
      subjectCode: subjectCode(member.rank_code),
      vesselName: vessel.name,
      masterEmail: vessel.master_email,
      setupComplete: !!vessel.setup_completed_at,
      ruleWorking: member.rank_code === 'MS' || !!row?.test_passed_at,
      requestedAt: member.created_at
    }
  };
}

export async function GET(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  // The profile asks whether an address is a ship's Master address before saving it as an interaction email.
  const check = req.nextUrl.searchParams.get('masterAddress');
  if (check !== null) {
    const email = normalizeEmail(check);
    const { data } = email ? await supabase.from('vessels').select('id').eq('master_email', email).limit(1) : { data: [] };
    return NextResponse.json({ isMasterAddress: !!(data && data.length) });
  }
  return NextResponse.json(await describe(await openMembership(user.id)));
}

export async function POST(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = await requestLink({
    userId: user.id,
    fallbackEmail: user.email || '',
    masterEmail: String(body.masterEmail || ''),
    vesselName: String(body.vesselName || '').trim().slice(0, 120) || null,
    imo: String(body.imo || '').replace(/\D/g, '').slice(0, 7) || null,
    origin: siteOrigin(req)
  });
  if (result.ok === false) {
    const failed = result as Extract<LinkResult, { ok: false }>;
    return NextResponse.json({ error: failed.error }, { status: failed.status });
  }
  const ok = result as Extract<LinkResult, { ok: true }>;
  const notice = ok.notice && ok.notice !== 'already-active' ? ok.notice : undefined;
  return NextResponse.json({ ...(await describe(ok.member)), ...(notice ? { notice } : {}) });
}

export async function DELETE(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const current = await openMembership(user.id);
  if (current) await endMembership(current.id);
  return NextResponse.json({ link: null });
}
