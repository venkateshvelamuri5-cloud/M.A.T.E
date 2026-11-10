import { SmtpService } from '../services/smtp';
import { Rank, subjectCode } from './ranks';
import { mateInbox, Vessel, vesselLabel } from './vessels';

// Emails for crew access. Mail meant only for the Master never carries "MATE-" in its subject,
// so the Master's outgoing rule can't send it back to M.A.T.E. Mail meant for an officer always
// does, so the Master's return rule for that rank forwards it to the onboard mailbox.

/** The short reference shown in an approval email's subject and body: the start of the approval token. */
export const approvalRef = (token: string) => token.slice(0, 10).toUpperCase();

const SIGN_OFF = '\n\nBest regards,\nM.A.T.E Team';

export async function sendApprovalRequest(opts: {
  vessel: Vessel; rank: Rank; officerName: string; officerEmail: string; approvalToken: string; origin: string;
  /** False when the Master has no M.A.T.E account yet: the email then invites them to sign up. */
  masterOnMate?: boolean;
}) {
  const { vessel, rank, officerName, officerEmail, approvalToken, origin, masterOnMate = true } = opts;
  const ship = vesselLabel(vessel);
  const approveUrl = `${origin}/crew/approve?token=${approvalToken}`;
  const ref = approvalRef(approvalToken);
  const setupUrl = `${origin}/ship-setup/${vessel.setup_token}`;
  const isMaster = rank.code === 'MS';

  const lines = [
    'Hello Captain,',
    '',
    isMaster
      ? `${officerName} (${officerEmail}) has linked a M.A.T.E account to this address as the Master of ${ship}. Please confirm it's you.`
      : `${officerName} (${officerEmail}) wants to use M.A.T.E as ${rank.label} on ${ship}, through this mailbox. Please approve.`,
    '',
    'To approve, reply to this email with the word APPROVE. Keep the subject as it is.',
    `Or, if this computer can open websites, use this link: ${approveUrl}`,
    '',
    `Ref: ${ref}`,
    ''
  ];
  if (!vessel.setup_completed_at) {
    lines.push(
      'This ship is not set up for crew email yet. On the setup page you enter each rank\'s onboard mailbox once,',
      'then copy the forwarding rules into Outlook. It takes about 15 minutes and is done once per ship:',
      setupUrl,
      ''
    );
  }
  lines.push(
    `Officers' questions and answers pass through this mailbox. Each officer uses their own M.A.T.E account and run limit.`,
    ''
  );
  if (!isMaster && !masterOnMate) {
    lines.push(
      'Captain, M.A.T.E can draft your own paperwork too: risk assessments, audit closures, drill records and more,',
      `written for ${ship}. Create your account in two minutes (it's free to start):`,
      masterSignupUrl(origin, vessel),
      ''
    );
  }
  lines.push('If you did not expect this email, ignore it and nothing will change.');

  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject: (isMaster ? `M.A.T.E: confirm your ship ${ship}` : `M.A.T.E: approve ${officerName} as ${rank.label} on ${ship}`) + ` (Ref: ${ref})`,
    text: lines.join('\n') + SIGN_OFF,
    // The Master's reply must reach the inbox the webhook reads, even if mail is sent from another address.
    replyTo: mateInbox()
  });
}

/** Answers the Master's emailed reply to an approval request. Never carries "MATE-", so it stays with the Master. */
export async function sendReplyApprovalResult(opts: {
  vessel: Vessel; officerName: string; rankLabel: string; ref: string; origin: string;
  outcome: 'approved' | 'already' | 'unclear' | 'failed'; error?: string;
}) {
  const { vessel, officerName, rankLabel, ref, origin, outcome, error } = opts;
  const ship = vesselLabel(vessel);
  const who = `${officerName} as ${rankLabel} on ${ship}`;
  const lines = ['Hello Captain,', ''];
  if (outcome === 'approved' || outcome === 'already') {
    lines.push(outcome === 'approved' ? `Thank you. ${who} is approved.` : `${who} was already approved. Nothing changed.`, '');
    if (!vessel.setup_completed_at) {
      lines.push(
        'This ship is not set up for crew email yet. The setup page lists each rank\'s onboard mailbox and the Outlook rules to add.',
        'If this computer can\'t open it, the officer can open it from a phone or in port and send you the rules:',
        `${origin}/ship-setup/${vessel.setup_token}`,
        ''
      );
    }
  } else if (outcome === 'unclear') {
    lines.push(
      `We received your reply about ${who}, but it didn't say APPROVE, so nothing changed.`,
      'To approve, reply to the original email with the word APPROVE. If you don\'t want to approve, no action is needed.',
      ''
    );
  } else {
    lines.push(`We couldn't approve ${who}: ${error || 'something went wrong'}.`, '');
  }
  lines.push(`Ref: ${ref}`);
  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject: outcome === 'approved' || outcome === 'already' ? `M.A.T.E: ${officerName} approved on ${ship}` : `M.A.T.E: not approved yet (Ref: ${ref})`,
    text: lines.join('\n') + SIGN_OFF,
    replyTo: mateInbox()
  });
}

/** Sign-up pre-filled as the Master of this ship, so the Master's own emails work straight away. */
export function masterSignupUrl(origin: string, vessel: Vessel) {
  const q = new URLSearchParams({ rank: 'Master', ship_email: vessel.master_email, ref: 'crew-approval' });
  return `${origin}/signup?${q.toString()}`;
}

export async function sendApprovedNotice(opts: { to: string; officerName: string; vessel: Vessel; rank: Rank; origin: string }) {
  const { to, officerName, vessel, rank, origin } = opts;
  const code = subjectCode(rank.code);
  const ship = vesselLabel(vessel);
  await new SmtpService().sendMail({
    to,
    subject: `You're approved on ${ship}`,
    text: [
      `Hello ${officerName},`,
      '',
      `The Master has approved you as ${rank.label} on ${ship}.`,
      '',
      vessel.setup_completed_at
        ? `From your onboard mailbox, email ${vessel.master_email} with "${code} TEST" in the subject once to check your rule. Then put your module and code in the subject of every request, for example "A1 // ${code}".`
        : `The Master still needs to finish the ship's email setup. You can see the status in your profile: ${origin}/dashboard`,
      '',
      'Answers come back to your onboard mailbox, with a copy here.'
    ].join('\n') + SIGN_OFF
  });
}

export async function sendRemovedNotice(opts: { to: string; officerName: string; vessel: Vessel; rank: Rank }) {
  const { to, officerName, vessel, rank } = opts;
  await new SmtpService().sendMail({
    to,
    subject: `Ship email ended on ${vesselLabel(vessel)}`,
    text: [
      `Hello ${officerName},`,
      '',
      `The Master has removed you as ${rank.label} on ${vesselLabel(vessel)}, so emails through that ship's mailbox are no longer answered for you.`,
      'Your M.A.T.E account, history and documents are unchanged. On your next ship, link again from your profile.'
    ].join('\n') + SIGN_OFF
  });
}

export async function sendWelcome(vessel: Vessel, rank: Rank, origin: string) {
  const code = subjectCode(rank.code);
  const ship = vesselLabel(vessel);
  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject: `${code} Welcome to M.A.T.E`,
    text: [
      `Hello ${rank.label},`,
      '',
      `M.A.T.E, the maritime AI assistant, is now available on ${ship} through the Master's mailbox.`,
      '',
      'To start:',
      `1. Sign up once with your personal Gmail at ${origin}/signup (you need internet for this, in port or on your phone).`,
      `2. Choose "${rank.label}" as your rank, open Profile, and link to this ship with the Master's address: ${vessel.master_email}`,
      '3. Once the Master approves, email the Master\'s address from your onboard mailbox with your module and code in the subject.',
      '',
      `   Example subject: A1 // ${code}`,
      '   Example body: Risk assessment for X-band radar repair',
      '',
      'The answer comes back to this mailbox.'
    ].join('\n') + SIGN_OFF
  });
}

export async function sendTestReply(vessel: Vessel, rank: Rank, subject: string) {
  const code = subjectCode(rank.code);
  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject: `Re: ${subject}`,
    text: [
      `Hello ${rank.label},`,
      '',
      `The setup works: your test reached M.A.T.E and this reply came back to the ${rank.label}'s mailbox on ${vesselLabel(vessel)}.`,
      `Put ${code} in the subject of every email to M.A.T.E, for example "A1 // ${code}".`
    ].join('\n') + SIGN_OFF
  });
}

export async function sendNotLinked(vessel: Vessel, rank: Rank, subject: string, origin: string) {
  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject: `Re: ${subject}`,
    text: [
      `Hello ${rank.label},`,
      '',
      `Your email reached M.A.T.E, but no officer is linked as ${rank.label} on ${vesselLabel(vessel)} yet, so it was not answered.`,
      '',
      `Sign up with your personal Gmail at ${origin}/signup, choose "${rank.label}" as your rank,`,
      `then link to this ship in your Profile with the Master's address (${vessel.master_email}).`,
      'Once the Master approves, send your question again.'
    ].join('\n') + SIGN_OFF
  });
}

export const rulesTarget = mateInbox;
