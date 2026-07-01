import { NextRequest, NextResponse } from 'next/server';
import { SmtpService } from '../../../src/services/smtp';
import { GeneratorService } from '../../../src/services/generator';

const WELCOME_MANUAL_TEXT = `M.A.T.E USER MANUAL
Maritime Automated Technical Executive
===========================================

Welcome aboard, Mariner!

You have successfully registered your M.A.T.E workspace. This document explains
everything you need to know to get the most out of your AI maritime assistant.

===========================================
WHAT IS M.A.T.E?
===========================================

M.A.T.E (Maritime Automated Technical Executive) is your AI-powered maritime
assistant. It helps you generate professional maritime documents, risk assessments,
port papers, cargo calculations, and much more — all tailored to your vessel.

You can interact with M.A.T.E in two ways:
  1. Via the Web UI (Dashboard)
  2. Via Email (from your registered vessel email)


===========================================
MODULES AVAILABLE
===========================================

(A) ISM ADMIN WORKS
  A1 - Risk Assessment
  A2 - Audit Closure (coming soon)
  A3 - Drill Notes (coming soon)
  A4 - Training Minutes (coming soon)

(B) ACCOUNTING & PAYROLL
  B1 - Payroll Calculation (coming soon)
  B2 - Vessel Accounts (coming soon)
  B3 - Bond Accounting (coming soon)
  B4 - Victualling Accounting (coming soon)

(C) CREW RELATED
  C1 - Port Papers (coming soon)
  C2 - Crew Certification (coming soon)

(D) CARGO RELATED (Tankers)
  D1 - Voyage Orders, Simplified (coming soon)
  D2 - Cargo Calculations (coming soon)

(E) INVENTORIES
  E1 - Ship's Library (coming soon)
  E2 - Ship's Certificates (coming soon)
  E3 - Medicine Chest (coming soon)
  E4 - Narcotics List (coming soon)

(F) MISC, ADDITIONAL
  F1 - SMS Clarification (Using AI)
  F2 - Weather Reports
  F3 - SIRE 2.0
  F4 - General Maritime AI Query


===========================================
HOW TO USE VIA EMAIL
===========================================

Send your query to: mate@logmark-ai.com
From: Your registered vessel email address

--- GUARANTEED ROUTING (Recommended) ---

Include the agent slot code in your subject line to guarantee routing to the
correct module. This is the most reliable method.

  Example Subject: [A1] Risk Assessment for anchor windlass failure
  Example Subject: [F2] Weather routing North Atlantic
  Example Subject: [F3] SIRE 2.0 observation review

--- KEYWORD ROUTING ---

If you don't include a slot code, M.A.T.E will automatically detect your intent
from keywords in your email body. Common keywords:

  A1 - Risk Assessment: "RA", "Risk Assessment", "Safety Assessment",
                        "Risk Analysis", "Hazard Identification"
  F2 - Weather:         "Weather", "Cyclone", "Routing", "Swell", "Wave"
  F3 - SIRE 2.0:        "SIRE", "VIQ", "Inspection", "SIRE 2.0"
  F4 - General:         Any general maritime question

--- EMAIL FORMAT ---

TO      : mate@logmark-ai.com
SUBJECT : [A1] Risk Assessment - X-band Radar
BODY    :
  Step 1 - Your main query or requirement
  Step 2 - Specific points you want AI to include (optional)

ATTACHMENT: You may attach relevant PDF documents as reference material.
            These will be read and incorporated into the response.

--- EXAMPLE EMAIL ---

TO      : mate@logmark-ai.com
SUBJECT : [A1] RA for X-band RADAR not working
BODY    :
Make a Risk Assessment for X-band RADAR failure.
Inform flag and class, obtain dispensation.
Include: watch keeping arrangements, contingency plan.

ATTACHMENT: office_instruction.pdf


===========================================
HOW TO USE VIA WEB UI
===========================================

Step 1 - Login at your M.A.T.E dashboard
Step 2 - Select a module from the dashboard (e.g., A1 - Risk Assessment)
Step 3 - Fill in the 4-step form:
           Step 1: Input your main requirement
           Step 2: Include specific elements you want AI to address
           Step 3: Upload or select reference documents from your workspace
           Step 4: Toggle email delivery if you want a copy sent to your email
Step 4 - Click SUBMIT and wait for your response

Your response will appear in the terminal panel on the right side of the screen.
You can download it as a .txt file or copy it to clipboard.


===========================================
IMPORTANT NOTES
===========================================

Token Usage
  Your account has a limited number of interactions. Monitor your token usage
  shown at the top of the dashboard. Contact your administrator to upgrade.

File Storage
  You have 25MB of personal workspace storage. Uploaded documents are used
  as reference material to generate more accurate, vessel-specific responses.

Disclaimer
  M.A.T.E is an AI assistant. All generated content should be reviewed and
  verified against your vessel's SMS, company procedures, and statutory
  requirements before execution.

  ** M.A.T.E can make mistakes. Please re-verify all outputs. **


===========================================
SUPPORT
===========================================

For technical support or queries, contact your system administrator.

Thank you for joining M.A.T.E.
Fair winds and following seas!

--- M.A.T.E Team ---
Maritime Automated Technical Executive
`;

/**
 * POST /api/welcome
 * Sends a welcome email with PDF user manual to a newly registered user.
 * Called from the signup page after successful Supabase auth registration.
 * Non-blocking — always returns 200 so it doesn't interrupt the signup flow.
 */
export async function POST(req: NextRequest) {
  const smtp = new SmtpService();
  const generator = new GeneratorService();

  try {
    const body = await req.json();
    const { email, fullName } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const name = fullName ? fullName.split(' ')[0] : 'Mariner';

    // Generate the user manual PDF
    const manualPdf = await generator.generatePDF(WELCOME_MANUAL_TEXT);

    // Build the welcome email HTML
    const htmlBody = `
<div style="background-color:#FCFBF8; font-family:'Inter',-apple-system,sans-serif; color:#1c2024; padding:32px 24px; max-width:600px; margin:0 auto; border:1px solid #dcdad5; border-radius:12px;">

  <div style="border-bottom:1px solid #dcdad5; padding-bottom:16px; margin-bottom:24px;">
    <h2 style="font-family:'Georgia',serif; color:#0a1826; font-size:22px; font-weight:bold; margin:0;">
      Welcome to M.A.T.E, ${name}!
    </h2>
    <span style="font-size:9px; text-transform:uppercase; letter-spacing:0.15em; color:#8c8c88; font-weight:bold; display:block; margin-top:4px;">
      Maritime Automated Technical Executive
    </span>
  </div>

  <p style="font-size:14px; line-height:1.7; color:#1c2024; margin-bottom:16px;">
    Your M.A.T.E workspace has been successfully activated. You now have access to your AI-powered maritime assistant — built to support your daily operational needs at sea and onshore.
  </p>

  <div style="background:#f0f4ff; border:1px solid #c7d2fe; border-radius:8px; padding:16px; margin-bottom:24px;">
    <h3 style="font-size:13px; font-weight:bold; color:#3730a3; margin:0 0 10px 0; text-transform:uppercase; letter-spacing:0.05em;">
      Two Ways to Interact
    </h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr>
        <td style="padding:8px 12px; background:#fff; border:1px solid #e0e7ff; border-radius:6px; width:48%; vertical-align:top;">
          <strong style="font-size:12px; color:#1e1b4b;">📧 Via Email</strong>
          <p style="font-size:11px; color:#555; margin:6px 0 0 0; line-height:1.5;">
            Send queries from your vessel email to <strong>mate@logmark-ai.com</strong>.<br>
            Use <strong>[A1]</strong> in your subject for guaranteed routing.
          </p>
        </td>
        <td style="width:4%;"></td>
        <td style="padding:8px 12px; background:#fff; border:1px solid #e0e7ff; border-radius:6px; width:48%; vertical-align:top;">
          <strong style="font-size:12px; color:#1e1b4b;">🖥️ Via Web UI</strong>
          <p style="font-size:11px; color:#555; margin:6px 0 0 0; line-height:1.5;">
            Login to your dashboard, select a module, fill Steps 1–4, and submit for instant AI response.
          </p>
        </td>
      </tr>
    </table>
  </div>

  <h3 style="font-size:13px; font-weight:bold; color:#0a1826; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">
    Active Modules
  </h3>
  <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:24px;">
    <tr style="background:#f5f5f0;">
      <td style="padding:6px 10px; border:1px solid #e5e4df;"><strong>A1</strong></td>
      <td style="padding:6px 10px; border:1px solid #e5e4df;">Risk Assessment</td>
      <td style="padding:6px 10px; border:1px solid #e5e4df; color:#059669; font-weight:bold;">Active</td>
    </tr>
    <tr>
      <td style="padding:6px 10px; border:1px solid #e5e4df;"><strong>F1</strong></td>
      <td style="padding:6px 10px; border:1px solid #e5e4df;">SMS Clarification</td>
      <td style="padding:6px 10px; border:1px solid #e5e4df; color:#059669; font-weight:bold;">Active</td>
    </tr>
    <tr style="background:#f5f5f0;">
      <td style="padding:6px 10px; border:1px solid #e5e4df;"><strong>F2</strong></td>
      <td style="padding:6px 10px; border:1px solid #e5e4df;">Weather Reports</td>
      <td style="padding:6px 10px; border:1px solid #e5e4df; color:#059669; font-weight:bold;">Active</td>
    </tr>
    <tr>
      <td style="padding:6px 10px; border:1px solid #e5e4df;"><strong>F3</strong></td>
      <td style="padding:6px 10px; border:1px solid #e5e4df;">SIRE 2.0</td>
      <td style="padding:6px 10px; border:1px solid #e5e4df; color:#059669; font-weight:bold;">Active</td>
    </tr>
    <tr style="background:#f5f5f0;">
      <td style="padding:6px 10px; border:1px solid #e5e4df;"><strong>F4</strong></td>
      <td style="padding:6px 10px; border:1px solid #e5e4df;">General Maritime AI</td>
      <td style="padding:6px 10px; border:1px solid #e5e4df; color:#059669; font-weight:bold;">Active</td>
    </tr>
  </table>

  <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:14px; margin-bottom:24px;">
    <p style="font-size:11px; color:#92400e; margin:0; line-height:1.6;">
      <strong>📎 Attached:</strong> Your complete M.A.T.E User Manual (PDF) with step-by-step instructions,
      module guide, email formatting examples, and routing keywords. Please save it for reference.
    </p>
  </div>

  <div style="background:#fff; border:1px solid #dcdad5; border-radius:8px; padding:14px; margin-bottom:24px;">
    <h3 style="font-size:12px; font-weight:bold; color:#0a1826; margin:0 0 8px 0;">Quick Email Example</h3>
    <p style="font-size:11px; color:#555; margin:0; line-height:1.8; font-family:monospace;">
      TO: mate@logmark-ai.com<br>
      SUBJECT: <strong>[A1] RA for X-band RADAR fault</strong><br>
      BODY: Make a Risk Assessment for X-band RADAR not working.<br>
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Inform flag and class, obtain dispensation.<br>
      ATTACHMENT: reference_doc.pdf (optional)
    </p>
  </div>

  <div style="border-top:1px solid #dcdad5; padding-top:16px; margin-top:8px; font-size:10px; color:#8c8c88; text-align:center;">
    <p style="margin:0 0 4px 0; font-weight:600;">⚠️ Disclaimer: M.A.T.E can make mistakes. Please re-verify all generated content before use.</p>
    <p style="margin:0;">© 2026 M.A.T.E. Merchant Navy Automation Systems. All rights reserved.</p>
  </div>
</div>`;

    await smtp.sendMail({
      to: email,
      subject: `Welcome to M.A.T.E — Your Maritime AI Assistant is Ready`,
      text: `Welcome to M.A.T.E, ${name}!\n\nYour workspace is now active. Please find your complete User Manual attached as a PDF.\n\nQuick start:\n- Email: Send queries to mate@logmark-ai.com from your vessel email. Use [A1] in subject for guaranteed routing.\n- Web UI: Login to your dashboard, select a module, fill Steps 1-4 and submit.\n\nDisclaimer: M.A.T.E can make mistakes. Please re-verify all outputs.\n\nFair winds!\nM.A.T.E Team`,
      html: htmlBody,
      attachments: [
        {
          filename: 'MATE_User_Manual.pdf',
          content: manualPdf,
          contentType: 'application/pdf'
        }
      ]
    });

    console.log(`Welcome email sent successfully to: ${email}`);
    return NextResponse.json({ success: true });

  } catch (err) {
    // Non-blocking — log but don't fail the signup
    console.error('Failed to send welcome email:', (err as Error).message);
    return NextResponse.json({ success: false, error: (err as Error).message });
  }
}
