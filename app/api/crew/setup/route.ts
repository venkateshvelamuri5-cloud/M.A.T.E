import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { rankByCode, ROUTED_RANKS } from '../../../../src/crew/ranks';
import { isEmail, isOwnAddress, mateInbox, normalizeEmail, vesselBySetupToken, vesselRanks, vesselStatus, Vessel } from '../../../../src/crew/vessels';
import { sendWelcome } from '../../../../src/crew/emails';
import { siteOrigin } from '../../../../src/crew/origin';

export const dynamic = 'force-dynamic';

// The ship setup page's data. The token was emailed to the Master's address and is the only key.
// GET reads the ship, POST {action:'save'} stores the onboard mailboxes, POST {action:'complete'}
// marks setup done and sends each rank a welcome email through the Master's rules.

async function payload(vessel: Vessel) {
  const { ranks } = await vesselStatus(vessel);
  return {
    vesselName: vessel.name,
    imo: vessel.imo,
    masterEmail: vessel.master_email,
    mateInbox: mateInbox(),
    setupComplete: !!vessel.setup_completed_at,
    ranks
  };
}

export async function GET(req: NextRequest) {
  const vessel = await vesselBySetupToken(req.nextUrl.searchParams.get('token') || '');
  if (!vessel) return NextResponse.json({ error: 'This setup link is not valid.' }, { status: 404 });
  return NextResponse.json(await payload(vessel));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const vessel = await vesselBySetupToken(String(body.token || ''));
  if (!vessel) return NextResponse.json({ error: 'This setup link is not valid.' }, { status: 404 });

  if (body.action === 'save') {
    const name = String(body.vesselName ?? vessel.name ?? '').trim().slice(0, 120) || null;
    const imo = String(body.imo ?? vessel.imo ?? '').replace(/\D/g, '').slice(0, 7) || null;
    const mailboxes: Record<string, string> = body.mailboxes || {};
    const rows = [];
    for (const r of ROUTED_RANKS) {
      const email = normalizeEmail(mailboxes[r.code]);
      if (email && (!isEmail(email) || isOwnAddress(email) || email === vessel.master_email)) {
        return NextResponse.json({ error: `The ${r.label} mailbox isn't a valid onboard address.` }, { status: 400 });
      }
      rows.push({ vessel_id: vessel.id, rank_code: r.code, onboard_email: email || null });
    }
    const existing = await vesselRanks(vessel.id);
    for (const row of rows) {
      const before = existing.find(e => e.rank_code === row.rank_code);
      const changed = (before?.onboard_email || null) !== row.onboard_email;
      // A new mailbox needs a new test and a new welcome email.
      const patch = changed ? { ...row, test_passed_at: null, welcome_sent_at: null } : row;
      const { error } = await supabase.from('vessel_ranks').upsert(patch, { onConflict: 'vessel_id,rank_code' });
      if (error) return NextResponse.json({ error: `Couldn't save: ${error.message}` }, { status: 500 });
    }
    await supabase.from('vessels').update({ name, imo }).eq('id', vessel.id);
    return NextResponse.json(await payload({ ...vessel, name, imo }));
  }

  if (body.action === 'complete') {
    const ranks = await vesselRanks(vessel.id);
    const withMailbox = ranks.filter(r => r.onboard_email && r.rank_code !== 'MS');
    if (!withMailbox.length) return NextResponse.json({ error: 'Enter at least one onboard mailbox first.' }, { status: 400 });
    const now = new Date().toISOString();
    await supabase.from('vessels').update({ setup_completed_at: vessel.setup_completed_at || now }).eq('id', vessel.id);
    const updated = { ...vessel, setup_completed_at: vessel.setup_completed_at || now };
    let sent = 0;
    for (const row of withMailbox.filter(r => !r.welcome_sent_at)) {
      const rank = rankByCode(row.rank_code);
      if (!rank) continue;
      try {
        await sendWelcome(updated, rank, siteOrigin(req));
        await supabase.from('vessel_ranks').update({ welcome_sent_at: new Date().toISOString() })
          .eq('vessel_id', vessel.id).eq('rank_code', row.rank_code);
        sent++;
      } catch (mailErr) {
        console.error(`Welcome email for ${row.rank_code} failed:`, (mailErr as Error).message);
      }
    }
    return NextResponse.json({ ...(await payload(updated)), welcomeSent: sent });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
