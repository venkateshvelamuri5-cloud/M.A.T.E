import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../src/supabase-client';
import { SmtpService } from '../../../src/services/smtp';

export async function POST(req: NextRequest) {
  const smtp = new SmtpService();

  try {
    const { userId, feedback, agentCode, agentName } = await req.json();

    if (!userId || !feedback) {
      return NextResponse.json({ error: 'Missing required fields: userId or feedback' }, { status: 400 });
    }

    // Query user profile details
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('email, full_name, rank, company_name')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr || !profile) {
      console.warn(`Could not fetch profile for user ${userId}:`, profileErr?.message);
    }

    const email = profile?.email || 'N/A';
    const name = profile?.full_name || 'N/A';
    const rank = profile?.rank || 'N/A';
    const company = profile?.company_name || 'N/A';

    const plainText = `M.A.T.E User Feedback Received\n\n` +
      `User Details:\n` +
      `- Name: ${name}\n` +
      `- Email: ${email}\n` +
      `- Rank: ${rank}\n` +
      `- Company: ${company}\n\n` +
      `Feedback Details:\n` +
      `- Module: ${agentCode || 'N/A'} - ${agentName || 'N/A'}\n` +
      `- Feedback: ${feedback}\n`;

    const htmlBody = `
<div style="background-color: #FCFBF8; font-family: 'Inter', -apple-system, sans-serif; color: #1c2024; padding: 32px 24px; max-width: 600px; margin: 0 auto; border: 1px solid #dcdad5; border-radius: 12px;">
  <div style="border-bottom: 1px solid #dcdad5; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="font-family: 'Georgia', serif; color: #0a1826; font-size: 20px; font-weight: bold; margin: 0;">User Feedback Submitted</h2>
    <span style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: #8c8c88; font-weight: bold; display: block; margin-top: 4px;">M.A.T.E Administration Alert</span>
  </div>
  
  <h3 style="font-size: 13px; font-weight: bold; color: #0a1826; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Sender Details</h3>
  <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; background: #FAF9F6; border: 1px solid #e5e4df; border-radius: 8px;">
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e4df; font-weight: bold; width: 120px;">Name</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e4df;">${name}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e4df; font-weight: bold;">Email</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e4df; font-family: monospace;">${email}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e4df; font-weight: bold;">Rank</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e4df;">${rank}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; font-weight: bold;">Company</td>
      <td style="padding: 8px 12px;">${company}</td>
    </tr>
  </table>

  <h3 style="font-size: 13px; font-weight: bold; color: #0a1826; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Feedback Details</h3>
  <div style="background: #fdf6e2; border: 1px solid #f5e8c4; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="font-size: 11px; font-weight: bold; color: #b58900; margin: 0 0 8px 0; text-transform: uppercase;">Module Context</p>
    <p style="font-size: 13px; font-weight: bold; color: #0a1826; margin: 0 0 12px 0;">${agentCode || 'N/A'} — ${agentName || 'N/A'}</p>
    <p style="font-size: 11px; font-weight: bold; color: #b58900; margin: 0 0 8px 0; text-transform: uppercase;">Message</p>
    <p style="font-size: 12px; line-height: 1.6; color: #1c2024; margin: 0; white-space: pre-wrap;">${feedback}</p>
  </div>

  <div style="border-top: 1px solid #dcdad5; padding-top: 16px; font-size: 10px; color: #8c8c88; text-align: center;">
    © 2026 M.A.T.E. Merchant Navy Automation Systems. All rights reserved.
  </div>
</div>
    `;

    await smtp.sendMail({
      to: 'hello@logmark-ai.com',
      subject: `[M.A.T.E Feedback] from ${rank} ${name}`,
      text: plainText,
      html: htmlBody
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Feedback email sending failed:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
