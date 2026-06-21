import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { GeminiService } from '../../../../src/services/gemini';
import { GeneratorService } from '../../../../src/services/generator';
import { SmtpService } from '../../../../src/services/smtp';

/**
 * POST handler for Hostinger Webhook
 * Configured with flexible body keys parsing to accept multiple email webhook payload formats.
 */
export async function POST(req: NextRequest) {
  const gemini = new GeminiService();
  const generator = new GeneratorService();
  const smtp = new SmtpService();

  try {
    // 1. Verify signatures if webhook secret is configured
    const signature = req.headers.get('x-hostinger-signature');
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && signature !== secret) {
      return NextResponse.json({ error: 'Unauthorized: Invalid signature' }, { status: 401 });
    }

    // 2. Parse body fields
    const body = await req.json();
    console.log('Received raw webhook payload body:', JSON.stringify(body));

    // Support flexible email parameters mapping:
    // Hostinger and various transactional mail webhooks pass keys under different names
    const from = body.from || body.sender || body.fromAddress || body.envelope?.from;
    const subject = body.subject || body.title || 'M.A.T.E Maritime Inquiry';
    const bodyText = body.bodyText || body.text || body.body || body.html || body.content;
    const promptQuery = body.promptQuery || body.query || body.ask || body.subject;
    const requestDocType = body.requestDocType || body.docType || 'pdf'; // Default to pdf responses

    if (!from || !bodyText) {
      console.warn(`Validation failed: Missing from (${from}) or bodyText (${bodyText ? 'Present' : 'Missing'})`);
      return NextResponse.json({ 
        error: 'Bad Request: Missing sender address or email text body', 
        receivedPayload: { from, subject, bodyText: bodyText ? 'Present' : 'Missing' } 
      }, { status: 400 });
    }

    let userId: string | null = null;
    let limitCount = 0;
    let limitMax = 10;

    // 3. Connect to Supabase to verify user profiles and limits
    try {
      let { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, subscription_plan')
        .eq('email', from)
        .maybeSingle();

      if (profileErr) {
        console.warn('Supabase profile query encountered error:', profileErr.message);
      }

      if (!profile) {
        console.log(`User profile for ${from} not found. Creating a new community profile...`);
        const { data: newProfile, error: createErr } = await supabase
          .from('profiles')
          .insert({
            id: '00000000-0000-0000-0000-' + Math.random().toString(36).substring(2, 14).padEnd(12, '0'),
            email: from,
            role: 'user',
            subscription_plan: 'free'
          })
          .select()
          .single();

        if (createErr || !newProfile) {
          throw new Error(`Failed to create community profile: ${createErr?.message}`);
        }
        profile = newProfile;

        const { error: limitErr } = await supabase
          .from('usage_limits')
          .insert({
            user_id: profile.id,
            interactions_count: 0,
            max_interactions: 10
          });

        if (limitErr) {
          console.warn('Could not initialize usage limits row:', limitErr.message);
        }
      }

      userId = profile.id;

      const { data: limits, error: limitQueryErr } = await supabase
        .from('usage_limits')
        .select('interactions_count, max_interactions')
        .eq('user_id', userId)
        .maybeSingle();

      if (limitQueryErr) {
        console.warn('Supabase limits query encountered error:', limitQueryErr.message);
      }

      if (limits) {
        limitCount = limits.interactions_count;
        limitMax = limits.max_interactions;
      }

    } catch (dbError) {
      console.error('Supabase DB connection failed, falling back to simulated limits:', (dbError as Error).message);
      limitCount = 2;
      limitMax = 10;
    }

    if (limitCount >= limitMax) {
      return NextResponse.json({ error: 'Limit exceeded: 10/10 community interactions used. Upgrade via Stripe.' }, { status: 403 });
    }

    // 4. Scrub PII and fetch context using Gemini
    const scrubbedText = await gemini.cleanAndScrubText(bodyText);

    let processedResult = scrubbedText;
    let fileReferenceContext = '';

    if (userId) {
      try {
        const { data: fileRef } = await supabase
          .from('user_files')
          .select('storage_path, name')
          .eq('user_id', userId)
          .eq('file_type', 'knowledge_base')
          .limit(1)
          .maybeSingle();

        if (fileRef) {
          console.log(`Found reference knowledge document: ${fileRef.name}`);
          const { data: fileBlob, error: downloadErr } = await supabase.storage
            .from('knowledge-base')
            .download(fileRef.storage_path);

          if (!downloadErr && fileBlob) {
            fileReferenceContext = await fileBlob.text();
            console.log('Successfully retrieved grounding file contents from storage bucket');
          }
        }
      } catch (fileErr) {
        console.warn('Failed to query user files from Supabase Storage:', (fileErr as Error).message);
      }
    }

    if (promptQuery) {
      processedResult = await gemini.runGroundedQuery(promptQuery, `${scrubbedText}\n\n${fileReferenceContext}`);
    }

    // 5. Generate documents
    let letterheadBuffer: Buffer | undefined;
    if (userId && requestDocType === 'pdf') {
      try {
        const { data: letterheadRef } = await supabase
          .from('user_files')
          .select('storage_path')
          .eq('user_id', userId)
          .eq('file_type', 'letterhead')
          .limit(1)
          .maybeSingle();

        if (letterheadRef) {
          const { data: fileBlob, error: dlErr } = await supabase.storage
            .from('user-spaces')
            .download(letterheadRef.storage_path);

          if (!dlErr && fileBlob) {
            letterheadBuffer = Buffer.from(await fileBlob.arrayBuffer());
          }
        }
      } catch (lhErr) {
        console.warn('Could not load user letterhead from Supabase Storage:', (lhErr as Error).message);
      }
    }

    const emailAttachments: any[] = [];
    if (requestDocType === 'pdf') {
      const pdfBytes = await generator.generatePDF(processedResult, letterheadBuffer);
      emailAttachments.push({
        filename: 'document-reply.pdf',
        content: pdfBytes,
        contentType: 'application/pdf'
      });
    } else if (requestDocType === 'docx') {
      const docxBytes = await generator.generateDOCX(processedResult);
      emailAttachments.push({
        filename: 'document-reply.docx',
        content: docxBytes,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
    }

    // 6. Send Outbound SMTP Email response back
    const mailResponse = await smtp.sendMail({
      to: from,
      subject: `Re: ${subject}`,
      text: `Hello,\n\nHere is the requested information:\n\n${processedResult}\n\nThank you for using M.A.T.E.`,
      attachments: emailAttachments
    });

    // 7. Increment interaction usage limits counter & log transaction
    if (userId) {
      try {
        await supabase
          .from('usage_limits')
          .update({ interactions_count: limitCount + 1 })
          .eq('user_id', userId);

        await supabase
          .from('interactions_log')
          .insert({
            user_id: userId,
            subject: subject || 'Response Inquiry',
            status: 'Completed'
          });

        console.log(`Updated interaction limit counts to ${limitCount + 1}`);
      } catch (updErr) {
        console.warn('Could not update usage counters:', (updErr as Error).message);
      }
    }

    return NextResponse.json({
      success: true,
      messageId: mailResponse.messageId,
      mock: mailResponse.mock,
      interactionsLimit: `${limitCount + 1} / ${limitMax}`
    });

  } catch (error) {
    console.error('Vercel Serverless Webhook encountered an error:', error);
    return NextResponse.json({ error: 'Server Error', details: (error as Error).message }, { status: 500 });
  }
}
