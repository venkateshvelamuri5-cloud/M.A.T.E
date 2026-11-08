import { SmtpService } from '../services/smtp';
import { Rank, subjectCode } from './ranks';
import { mateInbox, Vessel, vesselLabel } from './vessels';

// Emails for crew access. Mail meant only for the Master never carries "MATE-" in its subject,
// so the Master's outgoing rule can't send it back to M.A.T.E. Mail meant for an officer always
// does, so the Master's return rule for that rank forwards it to the onboard mailbox.

const SIGN_OFF = '\n\nBest regards,\nM.A.T.E Team';

export async function sendApprovalRequest(opts: {
  vessel: Vessel; rank: Rank; officerName: string; officerEmail: string; approvalToken: string; origin: string;
}) {
  const { vessel, rank, officerName, officerEmail, approvalToken, origin } = opts;
  const ship = vesselLabel(vessel);
  const approveUrl = `${origin}/crew/approve?token=${approvalToken}`;
  const setupUrl = `${origin}/ship-setup/${vessel.setup_token}`;
  const isMaster = rank.code === 'MS';

  const lines = [
    'Hello Captain,',
    '',
    isMaster
      ? `${officerName} (${officerEmail}) has linked a M.A.T.E account to this address as the Master of ${ship}. Please confirm it's you:`
      : `${officerName} (${officerEmail}) wants to use M.A.T.E as ${rank.label} on ${ship}, through this mailbox. Please approve:`,
    approveUrl,
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
    'If you did not expect this email, ignore it and nothing will change.'
  );

  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject: isMaster ? `M.A.T.E: confirm your ship ${ship}` : `M.A.T.E: approve ${officerName} as ${rank.label} on ${ship}`,
    text: lines.join('\n') + SIGN_OFF
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
