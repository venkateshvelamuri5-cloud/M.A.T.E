import { supabase } from '../supabase-client';
import { Rank, rankFromLabel } from './ranks';
import {
  endMembership, getOrCreateVessel, isEmail, isOwnAddress, masterOnMate, newToken, normalizeEmail, openMembership,
  Vessel, VesselMember
} from './vessels';
import { sendApprovalRequest, sendJoinHelp, sendJoinReceived } from './emails';

// Linking an officer to a ship. From the profile page, or by email: the officer writes "MATE-JOIN"
// to the Captain's address from their onboard mailbox, and the Captain's mailbox passes it to M.A.T.E.

const RESEND_AFTER_MS = 10 * 60 * 1000;

export type LinkResult =
  | { ok: true; member: VesselMember; vessel: Vessel; rank: Rank; notice?: string }
  | { ok: false; error: string; status: number };

/** Creates (or re-sends) a pending link and emails the Master the Approve / Decline request. */
export async function requestLink(opts: {
  userId: string; fallbackEmail?: string; masterEmail: string; vesselName?: string | null; imo?: string | null; origin: string;
}): Promise<LinkResult> {
  const masterEmail = normalizeEmail(opts.masterEmail);
  if (!isEmail(masterEmail)) return { ok: false, error: "Enter the Master's email address.", status: 400 };
  if (isOwnAddress(masterEmail)) return { ok: false, error: "That's M.A.T.E's own address. Enter the Master's address.", status: 400 };

  const { data: profile } = await supabase.from('profiles').select('full_name, rank, email').eq('id', opts.userId).maybeSingle();
  const rank = rankFromLabel(profile?.rank);
  if (!rank) {
    return { ok: false, error: 'Pick your rank from the list in your profile and save it first. "Other" ranks can\'t use ship email.', status: 400 };
  }

  const vessel = await getOrCreateVessel(masterEmail, opts.vesselName || null, opts.imo || null);
  const current = await openMembership(opts.userId);
  if (current) {
    const same = current.vessel_id === vessel.id && current.rank_code === rank.code;
    if (same && current.status === 'active') return { ok: true, member: current, vessel, rank, notice: 'already-active' };
    if (same && Date.now() - new Date(current.created_at).getTime() < RESEND_AFTER_MS) {
      return { ok: true, member: current, vessel, rank, notice: 'The Master was emailed a few minutes ago. Try again later if it did not arrive.' };
    }
    await endMembership(current.id);
  }

  const approvalToken = newToken();
  const { data: member, error } = await supabase.from('vessel_members')
    .insert({ vessel_id: vessel.id, user_id: opts.userId, rank_code: rank.code, status: 'pending', approval_token: approvalToken })
    .select('*').single();
  if (error || !member) return { ok: false, error: `Couldn't link to the ship: ${error?.message || 'unknown error'}`, status: 500 };

  try {
    await sendApprovalRequest({
      vessel, rank,
      officerName: profile?.full_name || 'An officer',
      officerEmail: profile?.email || opts.fallbackEmail || '',
      approvalToken,
      origin: opts.origin,
      masterOnMate: await masterOnMate(vessel)
    });
  } catch (mailErr) {
    console.error('Approval email failed:', (mailErr as Error).message);
    return { ok: true, member: member as VesselMember, vessel, rank, notice: "Linked, but the email to the Master didn't send. Try again in a few minutes." };
  }
  return { ok: true, member: member as VesselMember, vessel, rank };
}

const JOIN_PATTERN = /\bMATE-JOIN\b/i;
const EMAIL_PATTERN = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export const isJoinSubject = (subject: string) => JOIN_PATTERN.test(subject || '');

/**
 * Handles "MATE-JOIN" emails. They arrive from the Captain's address: forwarded by hand, or by the
 * ship's Outlook rule once it exists. The officer is found by an address in the email: their sign-in
 * Gmail written in the body, or their onboard mailbox (their interaction email) in the forwarded header.
 * Joining only requests the link; the Captain still approves with the usual button.
 * Returns false when the email isn't a join request.
 */
export async function handleJoinEmail(opts: { from: string; subject: string; body: string; origin: string }): Promise<boolean> {
  if (!isJoinSubject(opts.subject)) return false;
  const master = normalizeEmail(opts.from);
  if (!isEmail(master) || isOwnAddress(master)) return true;

  const text = `${opts.subject}\n${(opts.body || '').replace(/<[^>]+>/g, ' ')}`;
  const found = Array.from(new Set((text.match(EMAIL_PATTERN) || []).map(normalizeEmail)))
    .filter(e => e !== master && !isOwnAddress(e))
    .slice(0, 10);

  // Someone emailing from their own sign-in address isn't writing from the ship.
  const { data: self } = await supabase.from('profiles').select('id').eq('email', master).limit(1);
  if (self && self.length) {
    await sendJoinHelp({ to: master, reason: 'own-address' });
    return true;
  }

  let officer: { id: string; email: string; full_name: string | null } | null = null;
  if (found.length) {
    const { data: byGmail } = await supabase.from('profiles').select('id, email, full_name').in('email', found).limit(2);
    const { data: byOnboard } = byGmail && byGmail.length === 1
      ? { data: [] as typeof byGmail }
      : await supabase.from('profiles').select('id, email, full_name').in('vessel_email', found).limit(2);
    const pool = byGmail && byGmail.length === 1 ? byGmail : byOnboard;
    if (pool && pool.length === 1) officer = pool[0];
  }
  if (!officer) {
    await sendJoinHelp({ to: master, reason: 'not-found' });
    return true;
  }

  const vesselName = text.match(/\bvessel(?:\s+name)?\s*[:\-]\s*(?:MV|M\/V|MT|M\.V\.)?\s*([A-Za-z0-9 .'-]{2,60})/i)?.[1]?.trim() || null;
  const result = await requestLink({ userId: officer.id, masterEmail: master, vesselName, origin: opts.origin });
  try {
    await sendJoinReceived({
      to: officer.email,
      officerName: officer.full_name || 'there',
      masterEmail: master,
      outcome: result.ok === false ? 'failed' : (result as Extract<LinkResult, { ok: true }>).notice === 'already-active' ? 'already' : 'requested',
      error: result.ok === false ? (result as Extract<LinkResult, { ok: false }>).error : undefined
    });
  } catch (mailErr) {
    console.error('Join notice failed:', (mailErr as Error).message);
  }
  return true;
}
