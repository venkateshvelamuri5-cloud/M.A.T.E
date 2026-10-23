import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../src/supabase-client';
import { SmtpService } from '../../../src/services/smtp';
import { userFromRequest } from '../../../src/services/limits';

const escapeHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * POST /api/feedback (signed-in officers)
 * Body: { feedback?, rating?: 'up' | 'down', agentCode, agentName, agentId?, logId? }
 * Saves the feedback against the run it is about and emails the team.
 */
export async function POST(req: NextRequest) {
  const smtp = new SmtpService();

  try {
    const user = await userFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Sign in again to send feedback.' }, { status: 401 });

    const body = await req.json();
    const rating: 'up' | 'down' | null = body.rating === 'up' || body.rating === 'down' ? body.rating : null;
    const note = String(body.feedback || '').trim().slice(0, 4000);
    const agentCode = String(body.agentCode || '').slice(0, 20);
    const agentName = String(body.agentName || '').slice(0, 200);
    if (!note && !rating) return NextResponse.json({ error: 'Write some feedback or pick thumbs up or down.' }, { status: 400 });

    // Make sure a referenced run belongs to this officer before linking to it.
    let logId: string | null = null;
    let request = '';
    if (body.logId) {
      const { data: run } = await supabase.from('interactions_log').select('id, user_id, email_request').eq('id', body.logId).maybeSingle();
      if (run && run.user_id === user.id) {
        logId = run.id;
        const r = String(run.email_request || '');
        const i = r.indexOf('Requirement:\n');
        request = (i === -1 ? r : r.slice(i + 13)).split('\n\nAdditional elements')[0].trim().slice(0, 160);
      }
    }

    const ratingText = rating === 'up' ? 'Helpful' : rating === 'down' ? 'Not helpful' : '';
    const summary = [ratingText, note].filter(Boolean).join('. ');
    const feedback = request ? `${summary} (on: "${request}")` : summary;

    await supabase.from('interactions_log').insert({
      user_id: user.id,
      subject: `Feedback on ${agentCode || 'module'} - ${agentName || 'unknown'}`,
      status: 'Feedback',
      agent_id: body.agentId || null,
      error_message: `User Feedback: ${feedback}`
    });

    // Query user profile details
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('email, full_name, rank, company_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      console.warn(`Could not fetch profile for user ${user.id}:`, profileErr?.message);
    }

    // Only a written note is worth an email; a bare thumbs up or down is just recorded.
    if (!note && rating === 'up') return NextResponse.json({ success: true });

    const email = escapeHtml(profile?.email || 'N/A');
    const name = escapeHtml(profile?.full_name || 'N/A');
    const rank = escapeHtml(profile?.rank || 'N/A');
    const company = escapeHtml(profile?.company_name || 'N/A');

    const plainText = `M.A.T.E User Feedback Received\n\n` +
      `User Details:\n` +
      `- Name: ${profile?.full_name || 'N/A'}\n` +
      `- Email: ${profile?.email || 'N/A'}\n` +
      `- Rank: ${profile?.rank || 'N/A'}\n` +
      `- Company: ${profile?.company_name || 'N/A'}\n\n` +
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
    <p style="font-size: 13px; font-weight: bold; color: #0a1826; margin: 0 0 12px 0;">${escapeHtml(agentCode || 'N/A')} — ${escapeHtml(agentName || 'N/A')}</p>
    <p style="font-size: 11px; font-weight: bold; color: #b58900; margin: 0 0 8px 0; text-transform: uppercase;">Message</p>
    <p style="font-size: 12px; line-height: 1.6; color: #1c2024; margin: 0; white-space: pre-wrap;">${escapeHtml(feedback)}</p>
  </div>

  <div style="border-top: 1px solid #dcdad5; padding-top: 16px; font-size: 10px; color: #8c8c88; text-align: center;">
    © 2026 M.A.T.E. Merchant Navy Automation Systems. All rights reserved.
  </div>
</div>
    `;

    await smtp.sendMail({
      to: 'hello@logmark-ai.com',
      subject: `[M.A.T.E Feedback] from ${(profile?.rank || '').replace(/[\r\n]/g, ' ')} ${(profile?.full_name || 'an officer').replace(/[\r\n]/g, ' ')}`,
      text: plainText,
      html: htmlBody
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Feedback email sending failed:', err);
    return NextResponse.json({ error: 'Feedback could not be sent. Please try again.' }, { status: 500 });
  }
}
