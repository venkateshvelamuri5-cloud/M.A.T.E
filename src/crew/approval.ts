import { supabase } from '../supabase-client';
import { rankByCode } from './ranks';
import { activeMember, endMembership, normalizeEmail, vesselByMasterEmail, Vessel, VesselMember } from './vessels';
import { approvalRef, sendApprovedNotice, sendReplyApprovalResult } from './emails';

// Approving an officer, from the link page or by the Master replying to the approval email.
//
// Many ships' internet PCs can send email but can't open M.A.T.E's website (email-only satcom,
// or a web filter that hasn't whitelisted the site). So the approval email also says "reply
// APPROVE". The reply is accepted only when it comes from the ship's Master address and carries
// the request's reference, which was only ever sent to that mailbox: the same proof as the link.

export { approvalRef };

// "Ref: 3FA9C21B7D". Kept free of "MATE-" so the Master's outgoing rule never forwards the reply as crew mail.
const REF_PATTERN = /\bRef[:#\s]*([0-9A-F]{10})\b/i;

export function findApprovalRef(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = (t || '').match(REF_PATTERN);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** The Master's own words: the reply text above the quoted original, without HTML. */
export function replyText(body: string): string {
  const plain = (body || '')
    .replace(/<blockquote[^>]*>/gi, '\n> ')
    .replace(/<(br|\/p|\/div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
  const out: string[] = [];
  for (const raw of plain.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('>')) break;
    if (/^-{2,}\s*(original message|forwarded message)/i.test(line)) break;
    if (/^_{5,}$/.test(line)) break;
    if (/^(from|sent|to|subject|date):\s/i.test(line)) break;
    if (/^on .+wrote:?$/i.test(line)) break;
    if (/^(hello captain|best regards|m\.a\.t\.e team)/i.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

export type ReplyDecision = 'approve' | 'unclear';

export function replyDecision(body: string): ReplyDecision {
  const words = replyText(body).slice(0, 300).toLowerCase();
  if (/\b(not|don't|dont|do not|never)\s+approve/.test(words) || /\b(reject|decline|deny|refuse)/.test(words)) return 'unclear';
  if (/\b(approve|approved|approving|confirm|confirmed|yes)\b/.test(words)) return 'approve';
  return 'unclear';
}

export interface ApproveResult {
  ok: boolean;
  /** Set when nothing changed, in words the Master can read. */
  error?: string;
  alreadyActive?: boolean;
}

/** Makes a pending request active, ends whoever held the rank before, and tells the officer. */
export async function approveMember(member: VesselMember, vessel: Vessel, origin: string): Promise<ApproveResult> {
  if (member.status === 'removed') return { ok: false, error: 'The officer withdrew this request or linked to another ship.' };
  if (member.status === 'active') return { ok: true, alreadyActive: true };

  // Crew change: the new officer takes the rank over from whoever held it.
  const current = await activeMember(vessel.id, member.rank_code);
  if (current && current.id !== member.id) await endMembership(current.id);
  const { error } = await supabase.from('vessel_members')
    .update({ status: 'active', approved_at: new Date().toISOString() }).eq('id', member.id);
  if (error) return { ok: false, error: `Couldn't approve: ${error.message}` };

  // Tell the officer at their sign-in address. A failed email doesn't undo the approval.
  const { data: officer } = await supabase.from('profiles').select('full_name, email').eq('id', member.user_id).maybeSingle();
  const rank = rankByCode(member.rank_code);
  if (officer?.email && rank) {
    try {
      await sendApprovedNotice({ to: officer.email, officerName: officer.full_name || 'there', vessel, rank, origin });
    } catch (mailErr) {
      console.error('Approval notice failed:', (mailErr as Error).message);
    }
  }
  return { ok: true };
}

/**
 * Handles an inbound email if it is the Master's reply to an approval request.
 * Returns false when it isn't one, so the webhook carries on with normal processing.
 */
export async function handleApprovalReply(opts: { from: string; subject: string; body: string; origin: string }): Promise<boolean> {
  const ref = findApprovalRef(opts.subject, opts.body);
  if (!ref) return false;
  const vessel = await vesselByMasterEmail(normalizeEmail(opts.from));
  if (!vessel) return false;

  const { data: candidates } = await supabase.from('vessel_members').select('*')
    .eq('vessel_id', vessel.id).like('approval_token', `${ref}%`).limit(2);
  const member = candidates && candidates.length === 1 ? (candidates[0] as VesselMember) : null;
  if (!member) return false;

  const { data: officer } = await supabase.from('profiles').select('full_name').eq('id', member.user_id).maybeSingle();
  const officerName = officer?.full_name || 'The officer';
  const rankLabel = rankByCode(member.rank_code)?.label || member.rank_code;
  const ref10 = approvalRef(member.approval_token || ref);

  if (replyDecision(opts.body) !== 'approve') {
    await sendReplyApprovalResult({ vessel, officerName, rankLabel, ref: ref10, outcome: 'unclear', origin: opts.origin });
    return true;
  }
  const result = await approveMember(member, vessel, opts.origin);
  await sendReplyApprovalResult({
    vessel, officerName, rankLabel, ref: ref10, origin: opts.origin,
    outcome: result.ok ? (result.alreadyActive ? 'already' : 'approved') : 'failed',
    error: result.error
  });
  return true;
}
