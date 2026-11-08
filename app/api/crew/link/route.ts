import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { userFromRequest } from '../../../../src/services/limits';
import { rankByCode, rankFromLabel, subjectCode } from '../../../../src/crew/ranks';
import {
  endMembership, getOrCreateVessel, isEmail, isOwnAddress, newToken, normalizeEmail, openMembership,
  masterOnMate, vesselById, VesselMember, vesselRanks
} from '../../../../src/crew/vessels';
import { sendApprovalRequest } from '../../../../src/crew/emails';
import { siteOrigin } from '../../../../src/crew/origin';

export const dynamic = 'force-dynamic';

// The officer's link to a ship: GET shows it, POST links (or re-sends the Master's approval), DELETE unlinks.

const RESEND_AFTER_MS = 10 * 60 * 1000;

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
  return NextResponse.json(await describe(await openMembership(user.id)));
}

export async function POST(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const masterEmail = normalizeEmail(body.masterEmail);
  const vesselName = String(body.vesselName || '').trim().slice(0, 120) || null;
  const imo = String(body.imo || '').replace(/\D/g, '').slice(0, 7) || null;

  if (!isEmail(masterEmail)) return NextResponse.json({ error: "Enter the Master's email address." }, { status: 400 });
  if (isOwnAddress(masterEmail)) return NextResponse.json({ error: "That's M.A.T.E's own address. Enter the Master's address." }, { status: 400 });

  const { data: profile } = await supabase.from('profiles').select('full_name, rank, email').eq('id', user.id).maybeSingle();
  const rank = rankFromLabel(profile?.rank);
  if (!rank) {
    return NextResponse.json({ error: 'Pick your rank from the list in your profile and save it first. "Other" ranks can\'t use ship email.' }, { status: 400 });
  }

  const vessel = await getOrCreateVessel(masterEmail, vesselName, imo);
  const current = await openMembership(user.id);
  if (current) {
    const same = current.vessel_id === vessel.id && current.rank_code === rank.code;
    if (same && current.status === 'active') return NextResponse.json(await describe(current));
    if (same && Date.now() - new Date(current.created_at).getTime() < RESEND_AFTER_MS) {
      return NextResponse.json({ ...(await describe(current)), notice: 'The Master was emailed a few minutes ago. Try again later if it did not arrive.' });
    }
    await endMembership(current.id);
  }

  const approvalToken = newToken();
  const { data: member, error } = await supabase.from('vessel_members')
    .insert({ vessel_id: vessel.id, user_id: user.id, rank_code: rank.code, status: 'pending', approval_token: approvalToken })
    .select('*').single();
  if (error || !member) return NextResponse.json({ error: `Couldn't link to the ship: ${error?.message || 'unknown error'}` }, { status: 500 });

  try {
    await sendApprovalRequest({
      vessel, rank,
      officerName: profile?.full_name || 'An officer',
      officerEmail: profile?.email || user.email || '',
      approvalToken,
      origin: siteOrigin(req),
      masterOnMate: await masterOnMate(vessel)
    });
  } catch (mailErr) {
    console.error('Approval email failed:', (mailErr as Error).message);
    return NextResponse.json({ ...(await describe(member as VesselMember)), notice: "Linked, but the email to the Master didn't send. Try again in a few minutes." });
  }

  return NextResponse.json(await describe(member as VesselMember));
}

export async function DELETE(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const current = await openMembership(user.id);
  if (current) await endMembership(current.id);
  return NextResponse.json({ link: null });
}
