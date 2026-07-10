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
  let marinerProfilePrompt = '';

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

    // 2.5 Filter and auto-respond to emails sent to hello@logmark-ai.com (support inbox)
    const toRaw = emailData.to || emailData.recipient || emailData.toAddress || body.envelope?.to || '';
    const toAddress = typeof toRaw === 'string'
      ? (toRaw.includes('<') ? toRaw.match(/<([^>]+)>/)?.[1] || toRaw : toRaw).trim().toLowerCase()
      : String(toRaw).toLowerCase();

    if (toAddress.includes('hello@logmark-ai.com')) {
      console.log(`Email received at support address hello@logmark-ai.com from ${from}. Sending redirection auto-reply...`);
      try {
        const redirectHtml = `
<div style="background-color: #FCFBF8; font-family: 'Inter', -apple-system, sans-serif; color: #1c2024; padding: 32px 24px; max-width: 600px; margin: 0 auto; border: 1px solid #dcdad5; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
  <div style="border-bottom: 1px solid #dcdad5; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="font-family: 'Fraunces', Georgia, serif; color: #0a1826; font-size: 20px; font-weight: bold; margin: 0;">M.A.T.E Support</h2>
    <span style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: #8c8c88; font-weight: bold; display: block; margin-top: 4px;">Maritime Automated Technical Executive</span>
  </div>

  <p style="font-size: 14px; line-height: 1.6; color: #1c2024; margin: 0 0 16px 0;">
    Hello,
  </p>

  <p style="font-size: 14px; line-height: 1.6; color: #1c2024; margin: 0 0 16px 0;">
    Thank you for contacting us at <strong>hello@logmark-ai.com</strong>. We have successfully received your message and our support team will review it shortly.
  </p>

  <div style="background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="font-size: 13px; font-weight: bold; color: #1e1b4b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">
      Need an Automated AI Technical Assessment?
    </p>
    <p style="font-size: 12px; line-height: 1.6; color: #555; margin: 0;">
      Please note that automated AI report generation, risk assessments, and voyage logs processing are handled exclusively through our dedicated assistant inbox.
      To request an AI assessment, please resend your query directly to:<br>
      <a href="mailto:mate@logmark-ai.com" style="color: #575ECF; font-weight: bold; text-decoration: none;">mate@logmark-ai.com</a>
    </p>
  </div>

  <div style="border-top: 1px solid #dcdad5; padding-top: 16px; margin-top: 32px; font-size: 11px; color: #555; font-weight: 500;">
    <p style="margin: 0 0 4px 0;">Best regards,</p>
    <p style="margin: 0; font-weight: 700; color: #1c2024;">M.A.T.E Support Team</p>
    <p style="margin: 2px 0 0 0; color: #8c8c88;">Merchant Navy Automation Systems</p>
  </div>

  <div style="border-top: 1px solid #dcdad5; padding-top: 12px; margin-top: 16px; font-size: 10px; color: #8c8c88; text-align: center; font-weight: 500;">
    © 2026 M.A.T.E. Merchant Navy Automation Systems. All rights reserved.
  </div>
</div>
        `;

        await smtp.sendMail({
          to: from,
          subject: `Re: ${subject || 'General Inquiry Received'}`,
          text: `Hello,\n\nThank you for reaching out to us at hello@logmark-ai.com. We'll look into it shortly.\n\nIf you need an automated AI technical assessment, please resend your query directly to mate@logmark-ai.com.\n\nBest regards,\nM.A.T.E Support Team`,
          html: redirectHtml
        });
      } catch (mailErr) {
        console.error('Failed to send redirection email:', (mailErr as Error).message);
      }
      return NextResponse.json({ success: true, message: 'Redirect auto-reply sent' });
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

    // Check if the user has already sent an email with the exact same content and received a response.
    // If so, we bypass the AI run entirely and resend the cached response.
    if (userId && subject && bodyText) {
      try {
        const { data: duplicateLog } = await supabase
          .from('interactions_log')
          .select('id, email_response')
          .eq('user_id', userId)
          .eq('subject', subject.trim())
          .eq('email_request', bodyText.trim())
          .eq('status', 'Completed')
          .not('email_response', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (duplicateLog && duplicateLog.email_response) {
          console.log(`[DUPLICATE] Exact request subject & body match found. Resending cached response from interaction: ${duplicateLog.id}`);
          
          // Wrap and format output response HTML
          const formattedHtml = wrapInEmailTemplate(formatMarkdownToHtml(duplicateLog.email_response));
          
          // Send cached response
          const mailResponse = await smtp.sendMail({
            to: from,
            subject: `Re: ${subject}`,
            text: `Hello,\n\nHere is the requested information:\n\n${duplicateLog.email_response}\n\nThank you for using M.A.T.E.`,
            html: formattedHtml
          });

          // Update the lock record we inserted to reflect cached duplicate success
          if (webhookId) {
            await supabase
              .from('interactions_log')
              .update({
                status: 'Completed',
                subject: `[Duplicate Request] ${subject}`,
                email_response: duplicateLog.email_response,
                routing_layer: 'cached_duplicate'
              })
              .eq('webhook_id', webhookId);
          }

          return NextResponse.json({ 
            success: true, 
            message: 'Duplicate query handled using cached response',
            messageId: mailResponse.messageId
          });
        }
      } catch (dupErr) {
        console.warn('Failed to query or handle duplicate check:', (dupErr as Error).message);
      }
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
        const uploadedStoragePaths = new Set<string>();
        const emailData = body.data || body;
        const attachments = emailData.attachments || body.attachments || [];

        // 1. Process new email attachments
        if (attachments && attachments.length > 0) {
          console.log(`Processing ${attachments.length} incoming email attachments...`);
          for (const attachment of attachments) {
            const filename = attachment.filename || attachment.name || `attachment_${Date.now()}`;
            const contentType = attachment.contentType || attachment.content_type || attachment.mimeType || 'application/octet-stream';
            
            let fileBuffer: Buffer | null = null;
            if (attachment.content) {
              fileBuffer = typeof attachment.content === 'string'
                ? Buffer.from(attachment.content, 'base64')
                : Buffer.from(attachment.content);
            } else if (attachment.url) {
              try {
                const res = await fetch(attachment.url);
                if (res.ok) {
                  fileBuffer = Buffer.from(await res.arrayBuffer());
                } else {
                  console.warn(`Failed to fetch attachment from url: ${attachment.url}, status: ${res.status}`);
                }
              } catch (fetchErr) {
                console.error(`Error fetching attachment from url ${attachment.url}:`, fetchErr);
              }
            }

            if (!fileBuffer) {
              console.warn(`Skipping attachment ${filename}: could not retrieve file content/buffer.`);
              continue;
            }

            // Upload attachment to Supabase Storage (user-spaces bucket)
            const storagePath = `${userId}/${Date.now()}_${filename}`;
            const { error: uploadErr } = await supabase.storage
              .from('user-spaces')
              .upload(storagePath, fileBuffer, {
                contentType,
                upsert: true
              });

            if (uploadErr) {
              console.error(`Failed to upload attachment ${filename} to Supabase Storage:`, uploadErr.message);
              continue;
            }

            uploadedStoragePaths.add(storagePath);

            // Save database metadata record
            const fileSizeMB = parseFloat((fileBuffer.length / (1024 * 1024)).toFixed(2));
            const fileExtension = filename.includes('.') 
              ? filename.substring(filename.lastIndexOf('.')).toLowerCase() 
              : '';
            const fileTypeClean = fileExtension.startsWith('.') ? fileExtension.substring(1) : (fileExtension || 'bin');

            const { error: dbErr } = await supabase
              .from('user_files')
              .insert({
                user_id: userId,
                name: filename,
                storage_path: storagePath,
                file_type: fileTypeClean,
                file_size_mb: fileSizeMB
              });

            if (dbErr) {
              console.error(`Failed to register attachment ${filename} in user_files:`, dbErr.message);
            } else {
              console.log(`Successfully registered attachment ${filename} in user_files.`);
            }

            // Log upload activity
            try {
              await supabase.from('interactions_log').insert({
                user_id: userId,
                subject: `Uploaded document via Email: ${filename}`,
                status: 'Completed'
              });
            } catch (err) {
              console.warn('Could not log attachment upload interaction:', (err as Error).message);
            }

            // Add the attachment directly to the current query context
            const fileExt = fileTypeClean.toLowerCase();
            let fileTextContent = '';
            if (fileExt === 'txt' || fileExt === 'md') {
              fileTextContent = fileBuffer.toString('utf-8');
            } else if (fileExt === 'docx') {
              try {
                const mammoth = require('mammoth');
                const result = await mammoth.extractRawText({ buffer: fileBuffer });
                fileTextContent = result.value;
              } catch (docxErr) {
                console.error(`Error extracting text from DOCX attachment ${filename}:`, docxErr);
              }
            } else if (fileExt === 'pdf') {
              pdfAttachments.push({
                data: fileBuffer,
                mimeType: 'application/pdf'
              });
              fileReferenceContext += `\n\n--- Document: ${filename} (Attached PDF) ---\n[This document is attached as a PDF file. Refer to the attached PDF for its full contents and layout.]\n`;
            }

            if (fileTextContent) {
              const cleanedText = FileProcessor.cleanToMarkdown(fileTextContent, filename);
              if (cleanedText) {
                fileReferenceContext += `\n\n--- Document: ${filename} ---\n${cleanedText}\n`;
              }
            }
          }
        }

        // 2. Extract keywords from the query/subject/body for user files filtering
        const searchText = `${subject} ${promptQuery || ''} ${bodyText}`;
        const stopWords = new Set(['what', 'make', 'vessel', 'please', 'with', 'from', 'about', 'need', 'have', 'does', 'show', 'your', 'were', 'that', 'this', 'there', 'their', 'only', 'also', 'include', 'report', 'send', 'query', 'task', 'run', 'agent']);
        const keywords = searchText
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 3 && !stopWords.has(word));

        // 3. Collect files to download (both user's private files and agent specialized knowledge files)
        const filesToDownload: any[] = [];

        // Fetch global knowledge base, agent specialized files, and user personal files in one query
        const queryParts: string[] = [
          'file_type.eq.knowledge_base',
          `user_id.eq.${userId}`
        ];
        if (selectedAgentId) {
          queryParts.push(`agent_id.eq.${selectedAgentId}`);
        }

        const { data: userFiles, error: userFilesErr } = await supabase
          .from('user_files')
          .select('storage_path, name, file_type, user_id, agent_id')
          .or(queryParts.join(','));

        if (userFilesErr) {
          console.warn('Failed to query files from database:', userFilesErr.message);
        } else if (userFiles) {
          filesToDownload.push(...userFiles);
        }

        FileProcessor.resetCache();

        if (filesToDownload.length > 0) {
          console.log(`Total files queried for hybrid context: ${filesToDownload.length}`);
          for (const fileRef of filesToDownload) {
            // Skip files that were uploaded as attachments in this run to avoid duplicate contexts
            if (uploadedStoragePaths.has(fileRef.storage_path)) {
              continue;
            }

            const isUserPersonalFile = fileRef.user_id === userId && fileRef.file_type !== 'knowledge_base' && !fileRef.agent_id;
            const isAgentOrKB = !isUserPersonalFile;

            // Determine file extension
            let fileExt = (fileRef.file_type || '').toLowerCase();
            if (fileExt === 'knowledge_base' && fileRef.name.includes('.')) {
              fileExt = fileRef.name.substring(fileRef.name.lastIndexOf('.') + 1).toLowerCase();
            }

            const nameMatchesKeywords = keywords.length === 0 || keywords.some(kw => 
              fileRef.name.toLowerCase().includes(kw)
            );

            // Skip personal PDF if name does not match keywords to prevent unnecessary storage downloads
            if (isUserPersonalFile && fileExt === 'pdf' && !nameMatchesKeywords) {
              continue;
            }

            // Determine storage bucket: user space vs knowledge base
            const bucketName = (fileRef.agent_id || fileRef.user_id === '00000000-0000-0000-0000-000000000000' || fileRef.file_type === 'knowledge_base')
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
              fileReferenceContext += `\n\n--- Document: ${fileRef.name} (Attached PDF) ---\n[This document is attached as a PDF file. Refer to the attached PDF for its full contents and layout.]\n`;
              continue;
            }

            // For personal text/docx files, verify keywords match either the name or content
            if (isUserPersonalFile) {
              const textMatchesKeywords = keywords.length === 0 || keywords.some(kw => 
                fileTextContent.toLowerCase().includes(kw)
              );
              if (!nameMatchesKeywords && !textMatchesKeywords) {
                continue;
              }
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
      marinerProfilePrompt = `
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
        scrubbedText, 
        `${marinerProfilePrompt}\n\n${fileReferenceContext}`,
        pdfAttachments,
        selectedAgentPrompt
      );

      if (processedResult) {
        processedResult = processedResult.replace(/gemini/gi, 'Generic AI');
      }

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

    // Build professional addressed email body
    const senderRank = profile?.rank || 'Officer';
    const senderName = profile?.full_name || from;
    const vesselName = profile?.vessel_name ? `MV ${profile.vessel_name}` : 'your vessel';
    const queryRef = subject ? `your request: "${subject}"` : 'your maritime inquiry';

    const plainTextBody = `Dear ${senderRank} ${senderName},\n\nThank you for your query via M.A.T.E. Please find below the generated response to ${queryRef}.\n\n---\n\n${processedResult}\n\n---\n\nThis response has been generated and tailored specifically for ${vesselName}. Please review all safety-critical parameters against your vessel's SMS and statutory requirements before execution.\n\nShould you require any clarification or a revised assessment, please do not hesitate to re-submit your query.\n\nBest regards,\nM.A.T.E — Maritime Automated Technical Executive\nMerchant Navy Automation Systems`;

    // Format output spacing and markup structure to styled HTML
    const formattedHtml = wrapInEmailTemplate(formatMarkdownToHtml(processedResult), senderRank, senderName, vesselName, queryRef);

    // 6. Send Outbound SMTP Email response back
    const mailResponse = await smtp.sendMail({
      to: from,
      subject: `Re: ${subject}`,
      text: plainTextBody,
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

        // Estimate tokens
        const totalInputText = (promptQuery || '') + '\n' + (marinerProfilePrompt || '') + '\n' + (scrubbedText || '') + '\n' + (fileReferenceContext || '') + '\n' + (selectedAgentPrompt || '');
        const inputTokens = Math.ceil(totalInputText.length / 4);
        const outputTokens = Math.ceil(processedResult.length / 4);

        // Gemini 2.5 Flash pay-as-you-go pricing (cost per 1M tokens)
        const isHighContext = inputTokens > 128000;
        const inputPricePerM = isHighContext ? 0.15 : 0.075;
        const outputPricePerM = isHighContext ? 0.60 : 0.30;
        
        const runCost = ((inputTokens * inputPricePerM) / 1000000) + ((outputTokens * outputPricePerM) / 1000000);

        if (webhookId) {
          await supabase
            .from('interactions_log')
            .update({
              status: 'Completed',
              agent_id: selectedAgentId,
              email_response: processedResult,
              routing_layer: routingLayer,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              run_cost: parseFloat(runCost.toFixed(6))
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
              routing_layer: routingLayer,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              run_cost: parseFloat(runCost.toFixed(6))
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


function wrapInEmailTemplate(formattedBody: string, rank?: string, name?: string, vesselName?: string, queryRef?: string): string {
  const greeting = rank && name 
    ? `Dear ${rank} ${name},` 
    : 'Dear Officer,';
  const queryLine = queryRef 
    ? `<p style="font-size: 13px; color: #444; margin: 0 0 20px 0;">Thank you for your query via M.A.T.E. Please find below the generated response to <strong>${queryRef}</strong>.</p>`
    : `<p style="font-size: 13px; color: #444; margin: 0 0 20px 0;">Thank you for your query via M.A.T.E. Please find below the generated response.</p>`;
  const closing = vesselName 
    ? `<p style="font-size: 12px; color: #555; margin: 24px 0 0 0;">This response has been tailored specifically for <strong>${vesselName}</strong>. Please review all safety-critical parameters against your vessel's SMS and statutory requirements before execution.</p>`
    : '';

  return `
<div style="background-color: #FCFBF8; font-family: 'Inter', -apple-system, sans-serif; color: #1c2024; padding: 32px 24px; max-width: 600px; margin: 0 auto; border: 1px solid #dcdad5; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
  <div style="border-bottom: 1px solid #dcdad5; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="font-family: 'Fraunces', Georgia, serif; color: #0a1826; font-size: 20px; font-weight: bold; margin: 0;">M.A.T.E Workspace</h2>
    <span style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: #8c8c88; font-weight: bold; display: block; margin-top: 4px;">Maritime Automated Technical Executive</span>
  </div>
  <p style="font-size: 14px; font-weight: 600; color: #1c2024; margin: 0 0 8px 0;">${greeting}</p>
  ${queryLine}
  <div style="line-height: 1.6; border-top: 1px solid #eee; padding-top: 20px;">
    ${formattedBody}
  </div>
  ${closing}
  <div style="border-top: 1px solid #dcdad5; padding-top: 16px; margin-top: 32px; font-size: 11px; color: #555; font-weight: 500;">
    <p style="margin: 0 0 4px 0;">Best regards,</p>
    <p style="margin: 0; font-weight: 700; color: #1c2024;">M.A.T.E — Maritime Automated Technical Executive</p>
    <p style="margin: 2px 0 0 0; color: #8c8c88;">Merchant Navy Automation Systems</p>
  </div>
  <div style="border-top: 1px solid #dcdad5; padding-top: 12px; margin-top: 16px; font-size: 10px; color: #8c8c88; text-align: center; font-weight: 500;">
    © 2026 M.A.T.E. Merchant Navy Automation Systems. All rights reserved.
  </div>
</div>
  `;
}

