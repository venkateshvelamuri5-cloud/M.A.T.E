import { SmtpService } from '../services/smtp';
import { Rank, subjectCode } from './ranks';
import { mateInbox, Vessel, vesselLabel } from './vessels';

// Emails for crew access. Mail meant only for the Master never carries "MATE-" in its subject,
// so the Master's outgoing rule can't send it back to M.A.T.E. Mail meant for an officer always
// does, so the Master's return rule for that rank forwards it to the onboard mailbox.

/** The short reference shown in an approval email's subject and body: the start of the approval token. */
export const approvalRef = (token: string) => token.slice(0, 10).toUpperCase();

const SIGN_OFF = '\n\nBest regards,\nM.A.T.E Team';

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A plain, professional HTML email that reads well in Outlook (tables and inline styles only).
 * Paragraphs are already-escaped HTML; buttons are links, usually mailto: so they work without web access.
 */
function emailHtml(opts: {
  paragraphs: string[];
  buttons?: { label: string; href: string; tone: 'primary' | 'secondary' }[];
  after?: string[];
  footnote?: string;
}) {
  const p = (html: string) => html.startsWith('<table') ? html : `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.55;color:#1c2024;">${html}</p>`;
  const buttons = (opts.buttons || []).map(b => {
    const style = b.tone === 'primary'
      ? 'background:#1f3a5f;color:#ffffff;border:1px solid #1f3a5f;'
      : 'background:#ffffff;color:#1f3a5f;border:1px solid #9aa7b8;';
    return `<td style="padding:0 10px 0 0;"><a href="${esc(b.href)}" style="${style}display:inline-block;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:bold;text-decoration:none;font-family:Arial,sans-serif;">${esc(b.label)}</a></td>`;
  }).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #dcdad5;border-radius:8px;background:#ffffff;">
<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5b6575;font-weight:bold;margin-bottom:18px;">M.A.T.E &middot; Crew email access</div>
${opts.paragraphs.map(p).join('\n')}
${buttons ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px 0;"><tr>${buttons}</tr></table>` : ''}
${(opts.after || []).map(p).join('\n')}
<p style="margin:18px 0 0 0;font-size:14px;color:#1c2024;">Best regards,<br>M.A.T.E Team</p>
${opts.footnote ? `<p style="margin:20px 0 0 0;padding-top:12px;border-top:1px solid #e6e4df;font-size:11px;line-height:1.5;color:#7a7f87;">${opts.footnote}</p>` : ''}
</div>`;
}

/** A mailto: link that opens the Master's mail program with the reply already written. */
function mailtoReply(subject: string, body: string) {
  return `mailto:${mateInbox()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The ready-written replies behind the Approve and Decline buttons. M.A.T.E reads "Decision:" and "Ref:". */
export function approvalReplies(opts: { officerName: string; rankLabel: string; ship: string; ref: string; isMaster: boolean }) {
  const { officerName, rankLabel, ship, ref, isMaster } = opts;
  const approveBody = isMaster
    ? [
      'Dear M.A.T.E Team,',
      '',
      `I confirm that I am the Master of ${ship} and that this M.A.T.E account is mine.`,
      '',
      'Decision: APPROVE',
      `Ref: ${ref}`,
      '',
      'Regards,',
      `Master, ${ship}`
    ]
    : [
      'Dear M.A.T.E Team,',
      '',
      `I confirm that ${officerName} is serving on board ${ship} as ${rankLabel}, and I approve their use of M.A.T.E through this ship's mailbox.`,
      '',
      'Decision: APPROVE',
      `Ref: ${ref}`,
      '',
      'Regards,',
      `Master, ${ship}`
    ];
  const declineBody = [
    'Dear M.A.T.E Team,',
    '',
    isMaster
      ? `This account was not set up by me. Please do not link it to ${ship}.`
      : `I cannot confirm ${officerName} as ${rankLabel} on board ${ship}. Please do not link them to this ship's mailbox.`,
    '',
    'Decision: DECLINE',
    `Ref: ${ref}`,
    '',
    'Regards,',
    `Master, ${ship}`
  ];
  return {
    approve: { subject: `Approval: ${officerName}, ${rankLabel}, ${ship} (Ref: ${ref})`, body: approveBody.join('\n') },
    decline: { subject: `Declined: ${officerName}, ${rankLabel}, ${ship} (Ref: ${ref})`, body: declineBody.join('\n') }
  };
}

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
  const replies = approvalReplies({ officerName, rankLabel: rank.label, ship, ref, isMaster });

  const request = isMaster
    ? `${officerName} (${officerEmail}) has linked a M.A.T.E account to this address as the Master of ${ship}. Please confirm that this is you.`
    : `${officerName} (${officerEmail}) has asked to use M.A.T.E as ${rank.label} on ${ship}, through this mailbox. Please confirm that they serve on board in this rank.`;

  // Plain text, for mail programs that don't show HTML.
  const lines = [
    'Dear Captain,',
    '',
    request,
    '',
    'To approve, reply to this email with the word APPROVE and keep the subject as it is.',
    `If this computer can open websites, you can also use this link: ${approveUrl}`,
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
  lines.push(`Officers' questions and answers pass through this mailbox. Each officer uses their own M.A.T.E account and run limit.`, '');
  if (!isMaster && !masterOnMate) {
    lines.push(
      'Captain, M.A.T.E can draft your own paperwork too: risk assessments, audit closures, drill records and more,',
      `written for ${ship}. Create your account in two minutes (it's free to start):`,
      masterSignupUrl(origin, vessel),
      ''
    );
  }
  lines.push('If you did not expect this email, ignore it and nothing will change.');

  const after = [
    'Approve opens a reply that is already written. Just press <b>Send</b>. M.A.T.E checks it came from this mailbox, marks the officer as verified, and emails you the Outlook rules for their rank. No website is needed.',
    `If the buttons don't open your mail program, reply to this email with the word <b>APPROVE</b> and keep the subject as it is.`
  ];
  if (!isMaster && !masterOnMate) {
    after.push(`M.A.T.E can also prepare the Master's own paperwork, such as risk assessments, audit closures and drill records, written for ${esc(ship)}. <a href="${esc(masterSignupUrl(origin, vessel))}" style="color:#1f3a5f;">Create your account</a>. It is free to start.`);
  }

  const html = emailHtml({
    paragraphs: ['Dear Captain,', esc(request)],
    buttons: [
      { label: isMaster ? 'Confirm it\'s me' : 'Approve', href: mailtoReply(replies.approve.subject, replies.approve.body), tone: 'primary' },
      { label: 'Decline', href: mailtoReply(replies.decline.subject, replies.decline.body), tone: 'secondary' }
    ],
    after,
    footnote: `Ref: ${ref}. Officers' questions and answers pass through this mailbox; each officer uses their own M.A.T.E account and run limit. If you did not expect this email, ignore it and nothing will change. Computer with web access? <a href="${esc(approveUrl)}" style="color:#7a7f87;">Approve online</a>.`
  });

  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject: (isMaster ? `M.A.T.E: confirm your ship ${ship}` : `M.A.T.E: approve ${officerName} as ${rank.label} on ${ship}`) + ` (Ref: ${ref})`,
    text: lines.join('\n') + SIGN_OFF,
    html,
    // The Master's reply must reach the inbox the webhook reads, even if mail is sent from another address.
    replyTo: mateInbox()
  });
}

/** Answers the Master's emailed reply to an approval request. Never carries "MATE-", so it stays with the Master. */
export async function sendReplyApprovalResult(opts: {
  vessel: Vessel; officerName: string; rankLabel: string; ref: string; origin: string;
  outcome: 'approved' | 'already' | 'declined' | 'unclear' | 'failed'; error?: string;
  /** The Outlook rules for this rank went out in a separate email. */
  rulesSent?: boolean;
}) {
  const { vessel, officerName, rankLabel, ref, origin, outcome, error, rulesSent } = opts;
  const ship = vesselLabel(vessel);
  const who = `${officerName} as ${rankLabel} on ${ship}`;
  const setupUrl = `${origin}/ship-setup/${vessel.setup_token}`;
  const paras: string[] = [];
  if (outcome === 'approved' || outcome === 'already') {
    paras.push(outcome === 'approved'
      ? `Thank you. ${who} is now verified. We have let them know.`
      : `${who} was already verified. Nothing has changed.`);
    if (rulesSent) {
      paras.push('We have sent you a separate email with the Outlook rules for this officer. Adding them takes about five minutes.');
    } else if (!vessel.setup_completed_at) {
      paras.push(`This ship is not yet set up for crew email. The setup page lists each rank's onboard mailbox and the Outlook rules to add. If this computer can't open it, the officer can open it from a phone or in port and send you the rules: ${setupUrl}`);
    }
  } else if (outcome === 'declined') {
    paras.push(`Thank you. ${who} has not been linked to this mailbox. We have let them know. No further action is needed.`);
  } else if (outcome === 'unclear') {
    paras.push(
      `We received your reply about ${who}, but could not tell whether you approve, so nothing has changed.`,
      'Please use the Approve or Decline button in the original email, or reply to it with the word APPROVE.'
    );
  } else {
    paras.push(`We could not complete your request for ${who}: ${error || 'something went wrong'}.`);
  }
  const subject = outcome === 'approved' || outcome === 'already' ? `M.A.T.E: ${officerName} verified on ${ship}`
    : outcome === 'declined' ? `M.A.T.E: ${officerName} not linked to ${ship}`
    : `M.A.T.E: no change made (Ref: ${ref})`;
  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject,
    text: ['Dear Captain,', '', ...paras.flatMap(x => [x, '']), `Ref: ${ref}`].join('\n') + SIGN_OFF,
    html: emailHtml({ paragraphs: ['Dear Captain,', ...paras.map(esc)], footnote: `Ref: ${ref}` }),
    replyTo: mateInbox()
  });
}

/** Tells the officer, at their sign-in address, that the Master declined the request. */
export async function sendDeclinedNotice(opts: { to: string; officerName: string; vessel: Vessel; rank: Rank }) {
  const { to, officerName, vessel, rank } = opts;
  await new SmtpService().sendMail({
    to,
    subject: `Ship email request not approved on ${vesselLabel(vessel)}`,
    text: [
      `Hello ${officerName},`,
      '',
      `The Master of ${vesselLabel(vessel)} did not approve your request to use M.A.T.E as ${rank.label} through the ship's mailbox.`,
      `If this is a mistake, check the Master's email address in your profile, speak to the Master and link again.`,
      'Your M.A.T.E account is unchanged.'
    ].join('\n') + SIGN_OFF
  });
}

/** Sign-up pre-filled as the Master of this ship, so the Master's own emails work straight away. */
export function masterSignupUrl(origin: string, vessel: Vessel) {
  const q = new URLSearchParams({ rank: 'Master', ship_email: vessel.master_email, ref: 'crew-approval' });
  return `${origin}/signup?${q.toString()}`;
}

export async function sendApprovedNotice(opts: { to: string; officerName: string; vessel: Vessel; rank: Rank; origin: string; rulesSent?: boolean }) {
  const { to, officerName, vessel, rank, origin, rulesSent } = opts;
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
      rulesSent
        ? `The Master has been sent the Outlook rules for your rank. Once they are added, email ${vessel.master_email} from your onboard mailbox with "${code} TEST" in the subject. When the test comes back, put your module and code in the subject of every request, for example "A1 // ${code}".`
        : vessel.setup_completed_at
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

/**
 * The Outlook rules for one rank, emailed to the Master after approval, so no website is needed.
 * The subject has no "MATE-", so the Master's own rule doesn't forward it.
 */
export async function sendRulesEmail(opts: { vessel: Vessel; rank: Rank; onboardEmail: string; officerName: string; firstRank: boolean }) {
  const { vessel, rank, onboardEmail, officerName, firstRank } = opts;
  const code = subjectCode(rank.code);
  const inbox = mateInbox();
  const ship = vesselLabel(vessel);
  const rule1 = [
    `Rule A (once per ship${firstRank ? '' : ', skip it if you already added it'}): "M.A.T.E questions out"`,
    `  When: the subject includes  MATE-`,
    `  Do: forward it to  ${inbox}`,
    `  Except: if it is from  ${inbox}`
  ];
  const rule2 = [
    `Rule B: "M.A.T.E answers to ${rank.label}"`,
    `  When: it is from  ${inbox}  and the subject includes  ${code}`,
    `  Do: forward it to  ${onboardEmail}`
  ];
  const classic = [
    'Classic Outlook: File > Manage Rules & Alerts > New Rule > "Apply rule on messages I receive".',
    'Tick the conditions, click each underlined word to enter the value, choose "forward it to people or public group", add the exception where listed, name the rule and Finish.'
  ];
  const newer = [
    'New Outlook or Outlook on the web: Settings > Mail > Rules > Add new rule.',
    'Name it, add the conditions and the action "Forward to", add the exception where listed, and Save.'
  ];
  const text = [
    'Dear Captain,',
    '',
    `${officerName} (${rank.label}) is now verified on ${ship}. To pass their questions and answers through this mailbox, please add these Outlook rules on this computer.`,
    '',
    ...rule1, '',
    ...rule2, '',
    'How to add a rule:',
    ...classic, ...newer,
    '',
    `When the rules are in place, ${officerName} will send one email with "${code} TEST" in the subject from ${onboardEmail}. M.A.T.E replies, and the rank is marked as working.`,
    'The rules only forward emails that carry a M.A.T.E code. Nothing else in your mailbox is touched.'
  ].join('\n') + SIGN_OFF;

  const ruleHtml = (title: string, rows: [string, string][]) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 14px 0;border:1px solid #dcdad5;border-radius:6px;">
<tr><td colspan="2" style="padding:10px 14px;font-weight:bold;font-size:14px;color:#1c2024;border-bottom:1px solid #e6e4df;">${esc(title)}</td></tr>
${rows.map(([k, v]) => `<tr><td style="padding:6px 14px;width:90px;font-size:13px;color:#5b6575;vertical-align:top;">${esc(k)}</td><td style="padding:6px 14px;font-size:13px;color:#1c2024;">${v}</td></tr>`).join('')}
</table>`;
  const mono = (v: string) => `<code style="font-family:Consolas,monospace;background:#f3f2ef;padding:1px 5px;border-radius:3px;">${esc(v)}</code>`;
  const html = emailHtml({
    paragraphs: [
      'Dear Captain,',
      `${esc(officerName)} (${esc(rank.label)}) is now verified on ${esc(ship)}. To pass their questions and answers through this mailbox, please add these Outlook rules on this computer. It takes about five minutes.`,
      ruleHtml(`Rule A: M.A.T.E questions out${firstRank ? ' (once per ship)' : ' (skip if already added)'}`, [
        ['When', `the subject includes ${mono('MATE-')}`],
        ['Do', `forward it to ${mono(inbox)}`],
        ['Except', `if it is from ${mono(inbox)}`]
      ]),
      ruleHtml(`Rule B: M.A.T.E answers to ${rank.label}`, [
        ['When', `it is from ${mono(inbox)} and the subject includes ${mono(code)}`],
        ['Do', `forward it to ${mono(onboardEmail)}`]
      ]),
      `<b>Classic Outlook:</b> File &gt; Manage Rules &amp; Alerts &gt; New Rule &gt; "Apply rule on messages I receive". Tick the conditions, click each underlined word to enter the value, choose "forward it to people or public group", add the exception where listed, name the rule and Finish.`,
      `<b>New Outlook or Outlook on the web:</b> Settings &gt; Mail &gt; Rules &gt; Add new rule. Name it, add the conditions and the action "Forward to", add the exception where listed, and Save.`,
      `When the rules are in place, ${esc(officerName)} will send one email with ${mono(`${code} TEST`)} in the subject from ${esc(onboardEmail)}. M.A.T.E replies, and the rank is marked as working. The rules only forward emails that carry a M.A.T.E code; nothing else in your mailbox is touched.`
    ]
  });

  await new SmtpService().sendMail({
    to: vessel.master_email,
    subject: `M.A.T.E: Outlook rules for ${rank.label} on ${ship}`,
    text,
    html,
    replyTo: inbox
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
