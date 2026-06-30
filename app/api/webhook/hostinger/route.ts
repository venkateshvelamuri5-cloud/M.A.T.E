import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { GeminiService } from '../../../../src/services/gemini';
import { GeneratorService } from '../../../../src/services/generator';
import { SmtpService } from '../../../../src/services/smtp';
import { FileProcessor } from '../../../../src/services/fileProcessor';

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
  let bodyText = '';
  let profile: any = null;

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
    bodyText = emailData.plainBody || emailData.bodyText || emailData.text || emailData.body || emailData.htmlBody || emailData.html || emailData.content;
    const promptQuery = emailData.subject || emailData.promptQuery || emailData.query || emailData.ask;
    const requestDocType = emailData.requestDocType || emailData.docType || 'pdf'; // Default to pdf responses

    if (!from || !bodyText) {
      console.warn(`Validation failed: Missing from (${from}) or bodyText (${bodyText ? 'Present' : 'Missing'})`);
      return NextResponse.json({ 
        error: 'Bad Request: Missing sender address or email text body', 
        receivedPayload: { from, subject, bodyText: bodyText ? 'Present' : 'Missing' } 
      }, { status: 400 });
    }

    // Generate a fallback hash-based ID if none is supplied
    if (!webhookId && from && bodyText) {
      const crypto = require('crypto');
      webhookId = crypto.createHash('md5').update(`${from}_${subject || ''}_${bodyText.substring(0, 500)}`).digest('hex');
      
      try {
        const { data: existingLog } = await supabase
          .from('interactions_log')
          .select('id')
          .eq('webhook_id', webhookId)
          .maybeSingle();

        if (existingLog) {
          console.log(`Duplicate webhook detected (Hash ID: ${webhookId}). Skipping execution.`);
          return NextResponse.json({ success: true, message: 'Duplicate webhook skipped' });
        }
      } catch (checkErr) {
        console.warn('Hash idempotency check query failed:', (checkErr as Error).message);
      }
    }

    // 3. Connect to Supabase to verify user profiles and limits
    try {
      const { data: dbProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, subscription_plan, email, full_name, rank, company_name, vessel_name, vessel_type, operator_name, grt, has_pump_room, pump_system_type, has_bow_thruster, carries_chemical_cargo, has_egcs, egcs_type, operates_us_waters, operates_aus_nz_waters, operates_eu_waters, operates_chinese_waters')
        .or(`email.eq.${from},vessel_email.eq.${from}`)
        .maybeSingle();

      profile = dbProfile;

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

      // Acquire lock immediately by inserting a placeholder Processing row
      if (webhookId) {
        try {
          const { error: lockErr } = await supabase
            .from('interactions_log')
            .insert({
              user_id: userId,
              subject: subject || 'Response Inquiry',
              status: 'Processing',
              webhook_id: webhookId,
              email_request: bodyText
            });

          if (lockErr) {
            // Check if it already exists to return success immediately
            const { data: existingCheck } = await supabase
              .from('interactions_log')
              .select('id')
              .eq('webhook_id', webhookId)
              .maybeSingle();

            if (existingCheck) {
              console.log(`Lock acquisition failed. Duplicate webhook retry running or done: ${webhookId}`);
              return NextResponse.json({ success: true, message: 'Duplicate webhook skipped by lock' });
            }
          }
        } catch (lockFail) {
          console.warn('Failed to insert lock record:', (lockFail as Error).message);
        }
      }

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
    let agentConfigSendAttachment = false;
    let routingLayer = 'fallback';

    try {
      const { data: dbAgents } = await supabase
        .from('agents')
        .select('id, name, description, system_prompt, send_attachment, slot_code, keywords');

      if (dbAgents && dbAgents.length > 0) {

        // ── LAYER 1: Slot code override from email subject ──────────────────
        // Matches: [A1], A1:, A1 -, A1 — in subject line
        const slotCodeMatch = subject.match(/[\[\(]?\b([A-F][1-4])\b[\]\)]?/i);
        let matchedAgent = null;

        if (slotCodeMatch) {
          const extractedCode = slotCodeMatch[1].toUpperCase();
          matchedAgent = dbAgents.find(a => a.slot_code?.toUpperCase() === extractedCode) || null;
          if (matchedAgent) {
            routingLayer = `layer1_slot_code:${extractedCode}`;
            console.log(`[ROUTING] Layer 1 — Slot code override: ${extractedCode} → Agent: ${matchedAgent.name}`);
          }
        }

        // ── LAYER 2: Fuzzy keyword pre-match ────────────────────────────────
        if (!matchedAgent) {
          const searchText = `${subject} ${promptQuery || ''} ${bodyText}`;
          const keywordMatchId = gemini.fuzzyKeywordMatch(searchText, dbAgents);
          if (keywordMatchId) {
            matchedAgent = dbAgents.find(a => a.id === keywordMatchId) || null;
            if (matchedAgent) {
              routingLayer = `layer2_keyword`;
              console.log(`[ROUTING] Layer 2 — Keyword match → Agent: ${matchedAgent.name}`);
            }
          }
        }

        // ── LAYER 3: AI classification (last resort) ────────────────────────
        if (!matchedAgent) {
          const classifiedId = await gemini.classifyQuery(
            `Subject: ${subject}\n\nBody: ${promptQuery || bodyText}`,
            dbAgents
          );
          console.log(`[ROUTING] Layer 3 — AI classification → Agent ID: ${classifiedId}`);
          matchedAgent = dbAgents.find(a => a.id === classifiedId) || dbAgents[0];
          routingLayer = `layer3_ai`;
        }

        if (matchedAgent) {
          selectedAgentPrompt = matchedAgent.system_prompt;
          selectedAgentId = matchedAgent.id;
          agentConfigSendAttachment = matchedAgent.send_attachment || false;
          console.log(`[ROUTING] Final: Agent "${matchedAgent.name}" via ${routingLayer}`);
        }
      }
    } catch (agentErr) {
      console.warn('Agent routing failed, using default fallback:', (agentErr as Error).message);
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
          FileProcessor.resetCache();
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
            let fileTextContent = '';
            if (fileExt === 'txt' || fileExt === 'md') {
              fileTextContent = await fileBlob.text();
            } else if (fileExt === 'docx') {
              const arrayBuffer = await fileBlob.arrayBuffer();
              try {
                const mammoth = require('mammoth');
                const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
                fileTextContent = result.value;
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

            if (fileTextContent) {
              const cleanedText = FileProcessor.cleanToMarkdown(fileTextContent, fileRef.name);
              if (cleanedText) {
                fileReferenceContext += `\n\n--- Document: ${fileRef.name} ---\n${cleanedText}\n`;
              }
            }
          }
        }
      } catch (fileErr) {
        console.warn('Failed to query or parse user/agent files from Supabase Storage:', (fileErr as Error).message);
      }
    }

    if (promptQuery) {
      const marinerProfilePrompt = `
Vessel Particulars & Systems:
- Vessel Name: ${profile?.vessel_name || 'N/A'} (Type: ${profile?.vessel_type || 'N/A'})
- Operator: ${profile?.operator_name || 'N/A'} | GRT: ${profile?.grt || 'N/A'}
- Machinery config: ${profile?.has_pump_room ? 'Traditional Pump Room' : `Deepwell pumps (${profile?.pump_system_type || 'FRAMO'})`}
- Bow Thruster: ${profile?.has_bow_thruster ? 'Fitted' : 'Not fitted'}
- Chemical Cargo capability: ${profile?.carries_chemical_cargo ? 'Yes' : 'No'}
- EGCS (Scrubber): ${profile?.has_egcs ? (profile?.egcs_type || 'Open Loop') : 'None'}
- Active trading regions: US: ${!!profile?.operates_us_waters}, AUS/NZ: ${!!profile?.operates_aus_nz_waters}, EU: ${!!profile?.operates_eu_waters}, China: ${!!profile?.operates_chinese_waters}

Mariner Profile:
- Full Name: ${profile?.full_name || 'N/A'}
- Rank: ${profile?.rank || 'N/A'}
- Company: ${profile?.company_name || 'N/A'}
- User Email: ${profile?.email || from}
`;

      processedResult = await gemini.runGroundedQuery(
        promptQuery, 
        `${marinerProfilePrompt}\n\n${scrubbedText}\n\n${fileReferenceContext}`,
        pdfAttachments,
        selectedAgentPrompt
      );
      const disclaimer = `\n\n***\n[DISCLAIMER: M.A.T.E is an agentic AI assistant designed to support maritime operations. AI systems can make mistakes. Please re-verify all safety parameters, gas measurements, and checklist controls with your official vessel SMS and statutory guidelines before executing operations.]`;
      processedResult += disclaimer;
    }

    // 5. Generate documents only if explicitly requested or agent-configured
    const bodyLower = bodyText.toLowerCase();
    const subjectLower = subject.toLowerCase();
    const userRequestedAttachment = 
      body.data?.requestDocType || 
      body.data?.docType || 
      body.requestDocType || 
      body.docType || 
      subjectLower.includes('pdf') || 
      subjectLower.includes('docx') || 
      subjectLower.includes('attach') || 
      bodyLower.includes('send pdf') || 
      bodyLower.includes('send docx') || 
      bodyLower.includes('attach pdf') || 
      bodyLower.includes('attach docx');

    const shouldAttach = userRequestedAttachment || agentConfigSendAttachment;

    let letterheadBuffer: Buffer | undefined;
    if (userId && shouldAttach && (requestDocType === 'pdf' || !requestDocType)) {
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
    if (shouldAttach) {
      const docType = body.data?.requestDocType || body.data?.docType || body.requestDocType || body.docType || (bodyLower.includes('docx') ? 'docx' : 'pdf');
      if (docType === 'docx') {
        const docxBytes = await generator.generateDOCX(processedResult);
        emailAttachments.push({
          filename: 'document-reply.docx',
          content: docxBytes,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
      } else {
        const pdfBytes = await generator.generatePDF(processedResult, letterheadBuffer);
        emailAttachments.push({
          filename: 'document-reply.pdf',
          content: pdfBytes,
          contentType: 'application/pdf'
        });
      }
    }

    // Format output spacing and markup structure to styled HTML
    const formattedHtml = wrapInEmailTemplate(formatMarkdownToHtml(processedResult));

    // 6. Send Outbound SMTP Email response back
    const mailResponse = await smtp.sendMail({
      to: from,
      subject: `Re: ${subject}`,
      text: `Hello,\n\nHere is the requested information:\n\n${processedResult}\n\nThank you for using M.A.T.E.`,
      html: formattedHtml,
      attachments: emailAttachments
    });

    // 7. Increment interaction usage limits counter & log transaction with email requests/responses
    if (userId) {
      try {
        await supabase
          .from('usage_limits')
          .update({ interactions_count: limitCount + 1 })
          .eq('user_id', userId);

        if (webhookId) {
          await supabase
            .from('interactions_log')
            .update({
              status: 'Completed',
              agent_id: selectedAgentId,
              email_response: processedResult,
              routing_layer: routingLayer
            })
            .eq('webhook_id', webhookId);
        } else {
          await supabase
            .from('interactions_log')
            .insert({
              user_id: userId,
              subject: subject || 'Response Inquiry',
              status: 'Completed',
              agent_id: selectedAgentId,
              email_request: bodyText,
              email_response: processedResult,
              routing_layer: routingLayer
            });
        }

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
        if (webhookId) {
          await supabase
            .from('interactions_log')
            .update({
              status: 'Failed',
              agent_id: selectedAgentId,
              error_message: (error as Error).message
            })
            .eq('webhook_id', webhookId);
        } else {
          await supabase
            .from('interactions_log')
            .insert({
              user_id: userId,
              subject: subject || 'Failed Inquiry',
              status: 'Failed',
              agent_id: selectedAgentId,
              error_message: (error as Error).message,
              email_request: bodyText,
              email_response: null
            });
        }
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

// Spacing, layout and formatting helper functions for outbound email text content
function formatMarkdownToHtml(markdown: string): string {
  let html = markdown
    .replace(/^### (.*$)/gim, '<h3 style="font-family: \'Fraunces\', Georgia, serif; color: #0a1826; font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 8px;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="font-family: \'Fraunces\', Georgia, serif; color: #0a1826; font-size: 18px; font-weight: bold; margin-top: 24px; margin-bottom: 10px;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="font-family: \'Fraunces\', Georgia, serif; color: #0a1826; font-size: 22px; font-weight: bold; margin-top: 28px; margin-bottom: 12px;">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\s*[\*\-]\s+(.*$)/gim, '<li style="margin-bottom: 6px;">$1</li>');

  html = html.replace(/(<li[\s\S]*?>[\s\S]*?<\/li>)/g, '<ul style="margin-bottom: 16px; padding-left: 20px; line-height: 1.6; color: #1c2024;">$1</ul>');
  html = html.replace(/<\/ul>\s*<ul.*?>/g, '');

  const paragraphs = html.split(/\n\s*\n/);
  const formattedParagraphs = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<div')) {
      return p;
    }
    return `<p style="margin-bottom: 16px; line-height: 1.6; color: #1c2024; font-size: 14px;">${p.replace(/\n/g, '<br>')}</p>`;
  });

  return formattedParagraphs.join('\n');
}

function wrapInEmailTemplate(formattedBody: string): string {
  return `
<div style="background-color: #FCFBF8; font-family: 'Inter', -apple-system, sans-serif; color: #1c2024; padding: 32px 24px; max-width: 600px; margin: 0 auto; border: 1px solid #dcdad5; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
  <div style="border-bottom: 1px solid #dcdad5; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="font-family: 'Fraunces', Georgia, serif; color: #0a1826; font-size: 20px; font-weight: bold; margin: 0;">M.A.T.E Workspace</h2>
    <span style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: #8c8c88; font-weight: bold; display: block; margin-top: 4px;">Maritime Automated Technical Executive</span>
  </div>
  <div style="line-height: 1.6;">
    ${formattedBody}
  </div>
  <div style="border-top: 1px solid #dcdad5; padding-top: 16px; margin-top: 32px; font-size: 10px; color: #8c8c88; text-align: center; font-weight: 500;">
    © 2026 M.A.T.E. Merchant Navy Automation Systems. All rights reserved.
  </div>
</div>
  `;
}
