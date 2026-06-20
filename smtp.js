import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { GeminiService } from '../../../../src/services/gemini';
import { GeneratorService } from '../../../../src/services/generator';
import { SmtpService } from '../../../../src/services/smtp';

/**
 * POST handler for Hostinger Webhook
 * Fully integrated with Supabase DB & Storage
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
    const { from, subject, bodyText, promptQuery, requestDocType } = await req.json();

    if (!from || !bodyText) {
      return NextResponse.json({ error: 'Bad Request: Missing from or bodyText' }, { status: 400 });
    }

    let userId: string | null = null;
    let limitCount = 0;
    let limitMax = 10;

    // 3. Connect to Supabase to verify user profiles and limits
    try {
      // Fetch profile matching sender email
      let { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, subscription_plan')
        .eq('email', from)
        .maybeSingle();

      if (profileErr) {
        console.warn('Supabase profile query encountered error:', profileErr.message);
      }

      // If user profile does not exist, automatically enroll in the Community free space
      if (!profile) {
        console.log(`User profile for ${from} not found. Creating a new community profile...`);
        
        // Note: For simulation purposes, we insert directly. In full production, this maps to auth.users trigger
        const { data: newProfile, error: createErr } = await supabase
          .from('profiles')
          .insert({
            id: '00000000-0000-0000-0000-' + Math.random().toString(36).substring(2, 14).padEnd(12, '0'), // mock UUID placeholder
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

        // Initialize user interaction limit (10 free)
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

      // Fetch user interaction limit records
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
      // Fallback variables to ensure robustness if credentials aren't set yet
      limitCount = 2;
      limitMax = 10;
    }

    // Early limits check (10 interactions limit boundary)
    if (limitCount >= limitMax) {
      return NextResponse.json({ error: 'Limit exceeded: 10/10 community interactions used. Upgrade via Stripe.' }, { status: 403 });
    }

    // 4. Scrub PII and fetch context using Gemini
    const scrubbedText = await gemini.cleanAndScrubText(bodyText);

    // Ground query with knowledge files if requested
    let processedResult = scrubbedText;
    let fileReferenceContext = '';

    if (userId) {
      try {
        // Query user's custom template configurations from Supabase user_files
        const { data: fileRef } = await supabase
          .from('user_files')
          .select('storage_path, name')
          .eq('user_id', userId)
          .eq('file_type', 'knowledge_base')
          .limit(1)
          .maybeSingle();

        if (fileRef) {
          console.log(`Found reference knowledge document: ${fileRef.name}`);
          // For serverless runtimes, we download reference contents from Supabase Storage
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

    // 5. Generate documents (overlaying on custom PDF templates from Supabase Storage if available)
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
      subject: `Re: ${subject || 'Response Inquiry'}`,
      text: `Hello,\n\nHere is the requested information:\n\n${processedResult}\n\nThank you for using M.A.T.E.`,
      attachments: emailAttachments
    });

    // 7. Increment interaction usage limits counter
    if (userId) {
      try {
        await supabase
          .from('usage_limits')
          .update({ interactions_count: limitCount + 1 })
          .eq('user_id', userId);
        // Insert log history record
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
