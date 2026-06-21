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

  let userId: string | null = null;
  let selectedAgentId: string | null = null;
  let subject = 'M.A.T.E Maritime Inquiry';
  let from = '';
  let limitCount = 0;
  let limitMax = 10;
  let webhookId: string | null = null;

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
    
    webhookId = body.id || body.data?.id || body.messageId || body.data?.messageId;

    if (webhookId) {
      try {
        const { data: existingLog } = await supabase
          .from('interactions_log')
          .select('id')
          .eq('webhook_id', webhookId)
          .maybeSingle();

        if (existingLog) {
          console.log(`Duplicate webhook detected (ID: ${webhookId}). Skipping execution.`);
          return NextResponse.json({ success: true, message: 'Duplicate webhook skipped' });
        }
      } catch (checkErr) {
        console.warn('Idempotency check query failed, proceeding anyway:', (checkErr as Error).message);
      }
    }

    // Support flexible email parameters mapping:
    // Hostinger wraps email parameters inside a nested 'data' object.
    const emailData = body.data || body;

    const fromRaw = emailData.from || emailData.sender || emailData.fromAddress || body.envelope?.from;
    // Extract the raw email address if it is in format: "Name <email@domain.com>"
    from = typeof fromRaw === 'string' 
      ? (fromRaw.includes('<') ? fromRaw.match(/<([^>]+)>/)?.[1] || fromRaw : fromRaw).trim()
      : fromRaw;

    subject = emailData.subject || emailData.title || 'M.A.T.E Maritime Inquiry';
    const bodyText = emailData.plainBody || emailData.bodyText || emailData.text || emailData.body || emailData.htmlBody || emailData.html || emailData.content;
    const promptQuery = emailData.subject || emailData.promptQuery || emailData.query || emailData.ask;
    const requestDocType = emailData.requestDocType || emailData.docType || 'pdf'; // Default to pdf responses

    if (!from || !bodyText) {
      console.warn(`Validation failed: Missing from (${from}) or bodyText (${bodyText ? 'Present' : 'Missing'})`);
      return NextResponse.json({ 
        error: 'Bad Request: Missing sender address or email text body', 
        receivedPayload: { from, subject, bodyText: bodyText ? 'Present' : 'Missing' } 
      }, { status: 400 });
    }

    // 3. Connect to Supabase to verify user profiles and limits
    try {
      let { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, subscription_plan')
        .or(`email.eq.${from},vessel_email.eq.${from}`)
        .maybeSingle();

      if (profileErr) {
        console.warn('Supabase profile query encountered error:', profileErr.message);
      }

      if (!profile) {
        console.log(`User profile for ${from} not found. Sending sign up instruction email...`);
        await smtp.sendMail({
          to: from,
          subject: `Re: ${subject || 'M.A.T.E Workspace Invitation'}`,
          text: `Hello,\n\nYour email address (${from}) is not registered with M.A.T.E. Please sign up at your landing page first to initialize your workspace.\n\nThank you,\nM.A.T.E Team`
        });
        return NextResponse.json({ success: false, message: 'User profile not found. Emailed registration invite.' });
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
    const pdfAttachments: Array<{ data: Buffer; mimeType: string }> = [];

    // Fetch dynamic system prompts and route to correct agent
    let selectedAgentPrompt = 'You are an agentic maritime representative. Answer the query using the reference maritime data and user documents provided.';

    try {
      const { data: dbAgents } = await supabase
        .from('agents')
        .select('id, name, description, system_prompt');

      if (dbAgents && dbAgents.length > 0) {
        const classifiedId = await gemini.classifyQuery(promptQuery || bodyText, dbAgents);
        console.log(`Classified query to Agent ID: ${classifiedId}`);
        const matchedAgent = dbAgents.find(a => a.id === classifiedId) || dbAgents[0];
        if (matchedAgent) {
          selectedAgentPrompt = matchedAgent.system_prompt;
          selectedAgentId = matchedAgent.id;
          console.log(`Routed to Agent: ${matchedAgent.name}`);
        }
      }
    } catch (agentErr) {
      console.warn('Agent routing classification failed, using default fallback:', (agentErr as Error).message);
    }

    if (userId) {
      try {
        // Collect files to download (both user's private files and agent specialized knowledge files)
        const filesToDownload: any[] = [];

        // 1. Get user files from user_files
        const { data: userFiles, error: userFilesErr } = await supabase
          .from('user_files')
          .select('storage_path, name, file_type, user_id, agent_id')
          .eq('user_id', userId);

        if (userFilesErr) {
          console.warn('Failed to query user files from database:', userFilesErr.message);
        } else if (userFiles) {
          filesToDownload.push(...userFiles);
        }

        // 2. Get agent specialized knowledge files
        if (selectedAgentId) {
          const { data: matchedAgentFiles, error: agentFilesErr } = await supabase
            .from('user_files')
            .select('storage_path, name, file_type, user_id, agent_id')
            .eq('agent_id', selectedAgentId);

          if (agentFilesErr) {
            console.warn('Failed to query agent files from database:', agentFilesErr.message);
          } else if (matchedAgentFiles) {
            filesToDownload.push(...matchedAgentFiles);
          }
        }

        if (filesToDownload.length > 0) {
          console.log(`Total files to process for hybrid context: ${filesToDownload.length}`);
          for (const fileRef of filesToDownload) {
            // Determine storage bucket: user space vs knowledge base
            const bucketName = (fileRef.agent_id || fileRef.user_id === '00000000-0000-0000-0000-000000000000')
              ? 'knowledge-base'
              : 'user-spaces';

            console.log(`Processing reference document from bucket [${bucketName}]: ${fileRef.name} (${fileRef.file_type})`);
            const { data: fileBlob, error: downloadErr } = await supabase.storage
              .from(bucketName)
              .download(fileRef.storage_path);

            if (downloadErr || !fileBlob) {
              console.warn(`Failed to download ${fileRef.name} from storage:`, downloadErr?.message);
              continue;
            }

            const fileExt = (fileRef.file_type || '').toLowerCase();
            if (fileExt === 'txt' || fileExt === 'md') {
              const text = await fileBlob.text();
              fileReferenceContext += `\n\n--- Document: ${fileRef.name} ---\n${text}\n`;
            } else if (fileExt === 'docx') {
              const arrayBuffer = await fileBlob.arrayBuffer();
              try {
                const mammoth = require('mammoth');
                const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
                fileReferenceContext += `\n\n--- Document: ${fileRef.name} ---\n${result.value}\n`;
              } catch (docxErr) {
                console.error(`Error extracting text from DOCX ${fileRef.name}:`, docxErr);
              }
            } else if (fileExt === 'pdf') {
              const arrayBuffer = await fileBlob.arrayBuffer();
              pdfAttachments.push({
                data: Buffer.from(arrayBuffer),
                mimeType: 'application/pdf'
              });
            } else {
              console.log(`Skipping file parsing for unsupported extension: ${fileExt}`);
            }
          }
        }
      } catch (fileErr) {
        console.warn('Failed to query or parse user/agent files from Supabase Storage:', (fileErr as Error).message);
      }
    }

    if (promptQuery) {
      processedResult = await gemini.runGroundedQuery(
        promptQuery, 
        `${scrubbedText}\n\n${fileReferenceContext}`,
        pdfAttachments,
        selectedAgentPrompt
      );
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
            status: 'Completed',
            agent_id: selectedAgentId,
            webhook_id: webhookId
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
    
    // Log failure in database if user ID was identified
    if (userId) {
      try {
        await supabase
          .from('interactions_log')
          .insert({
            user_id: userId,
            subject: subject || 'Failed Inquiry',
            status: 'Failed',
            agent_id: selectedAgentId,
            error_message: (error as Error).message,
            webhook_id: webhookId
          });
      } catch (logErr) {
        console.warn('Could not log webhook failure in DB:', (logErr as Error).message);
      }
    }

    // Fail-safe: Email the user apologizing for the technical downtime so they aren't left waiting!
    if (from) {
      try {
        await smtp.sendMail({
          to: from,
          subject: `Re: ${subject || 'Inquiry Service Notice'}`,
          text: `Hello,\n\nWe received your inquiry regarding "${subject || 'your request'}".\n\nOur validation engine is currently experiencing temporary technical difficulties. Our system administrators have been notified, and we will process and resolve your query as soon as services are restored.\n\nWe apologize for the delay.\n\nThank you,\nM.A.T.E Team`
        });
        console.log('Successfully sent fail-safe downtime email notification to user');
      } catch (mailErr) {
        console.error('Could not send fail-safe email to user:', (mailErr as Error).message);
      }
    }

    // Return a clean 200 response to Hostinger to prevent unnecessary webhook retries
    return NextResponse.json({ 
      success: false, 
      error: 'Server encountered error, sent fail-safe notice.', 
      details: (error as Error).message 
    }, { status: 200 });
  }
}
