import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { GeminiService } from '../../../../src/services/gemini';
import { SmtpService } from '../../../../src/services/smtp';
import { FileProcessor } from '../../../../src/services/fileProcessor';

export async function POST(req: NextRequest) {
  const gemini = new GeminiService();

  try {
    const { userId, agentId, queryInput, selectedFileIds, sendEmail } = await req.json();

    if (!userId || !agentId || !queryInput) {
      return NextResponse.json({ error: 'Missing required parameters: userId, agentId, or queryInput' }, { status: 400 });
    }

    // 1. Fetch user profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('email, full_name, rank, company_name, subscription_plan, vessel_name, vessel_type, operator_name, grt, has_pump_room, pump_system_type, has_bow_thruster, carries_chemical_cargo, has_egcs, egcs_type, operates_us_waters, operates_aus_nz_waters, operates_eu_waters, operates_chinese_waters')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Failed to verify mariner profile' }, { status: 404 });
    }

    // 2. Verify and increment limits
    const { data: limits } = await supabase
      .from('usage_limits')
      .select('interactions_count, max_interactions')
      .eq('user_id', userId)
      .maybeSingle();

    const limitCount = limits ? limits.interactions_count : 0;
    const limitMax = limits ? limits.max_interactions : 10;

    if (limitCount >= limitMax) {
      return NextResponse.json({ error: 'Limit exceeded: 10/10 community interactions used. Upgrade via Stripe.' }, { status: 403 });
    }

    // 3. Fetch agent system prompt and classification info
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('name, system_prompt, instructions')
      .eq('id', agentId)
      .maybeSingle();

    if (agentErr || !agent) {
      return NextResponse.json({ error: 'Agent profile not found' }, { status: 404 });
    }

    // Strategy 1: Intelligent Short-Circuit
    const queryLower = queryInput.toLowerCase().trim();
    const isTemplateRequest = 
      queryLower.includes('send template') || 
      queryLower.includes('give template') || 
      queryLower.includes('email format') || 
      queryLower.includes('blank form') || 
      queryLower.includes('how to use this agent') || 
      queryLower.includes('show instructions') || 
      queryLower.includes('what is the instructions');

    if (isTemplateRequest) {
      const templateResponse = `[SYSTEM SHORT-CIRCUIT: Instructions & Email Template]\n\nAgent: ${agent.name}\n\nEmail Template / Instructions:\n${agent.instructions || 'No instructions provided by the analyst for this slot.'}`;
      
      await supabase
        .from('interactions_log')
        .insert({
          user_id: userId,
          subject: `Template Request: ${agent.name}`,
          status: 'Completed',
          agent_id: agentId,
          email_request: queryInput,
          email_response: templateResponse
        });

      return NextResponse.json({
        success: true,
        result: templateResponse,
        interactionsLimit: `${limitCount} / ${limitMax}`
      });
    }

    // Strategy 3: Response Caching (Exact query matching in last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: cachedLogs } = await supabase
      .from('interactions_log')
      .select('email_response')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('email_request', queryInput)
      .eq('status', 'Completed')
      .gt('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    if (cachedLogs && cachedLogs.length > 0) {
      const cachedResponse = `[CACHED RESPONSE - Last 24 Hours]\n\n${cachedLogs[0].email_response}`;
      return NextResponse.json({
        success: true,
        result: cachedResponse,
        interactionsLimit: `${limitCount} / ${limitMax}`
      });
    }

    // 4. Construct context from selected workspace files
    let fileReferenceContext = '';
    const pdfAttachments: Array<{ data: Buffer; mimeType: string }> = [];
    FileProcessor.resetCache();

    // Extract keywords for Strategy 2 (Lightweight RAG filtering)
    const stopWords = new Set(['what', 'make', 'vessel', 'please', 'with', 'from', 'about', 'need', 'have', 'does', 'show', 'your', 'were', 'that', 'this', 'there', 'their', 'only', 'also', 'include', 'report', 'send', 'query', 'task', 'run', 'agent']);
    const keywords = queryInput
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    let targetFileIds = selectedFileIds;
    if (targetFileIds === undefined) {
      const { data: userFiles } = await supabase
        .from('user_files')
        .select('id')
        .eq('user_id', userId)
        .not('file_type', 'eq', 'knowledge_base');
      if (userFiles) {
        targetFileIds = userFiles.map(f => f.id);
      }
    }

    let files: any[] = [];
    const queryParts: string[] = [];
    if (targetFileIds && targetFileIds.length > 0) {
      queryParts.push(`and(id.in.(${targetFileIds.join(',')}),user_id.eq.${userId})`);
    }
    queryParts.push('file_type.eq.knowledge_base');

    const { data: fetchedFiles } = await supabase
      .from('user_files')
      .select('*')
      .or(queryParts.join(','));

    if (fetchedFiles) {
      files = fetchedFiles;
    }

    if (files && files.length > 0) {
      for (const file of files) {
           const bucketName = (file.agent_id || file.user_id === '00000000-0000-0000-0000-000000000000' || file.file_type === 'knowledge_base')
             ? 'knowledge-base'
             : 'user-spaces';

           const { data: fileBlob, error: downloadErr } = await supabase.storage
              .from(bucketName)
              .download(file.storage_path);

           if (downloadErr) {
             console.error(`[STORAGE DOWNLOAD ERROR] Failed to download "${file.name}" from bucket "${bucketName}":`, downloadErr.message || downloadErr);
           }

           if (fileBlob) {
            let fileExt = (file.file_type || '').toLowerCase();
            if (fileExt === 'knowledge_base' && file.name.includes('.')) {
              fileExt = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
            }
            let fileTextContent = '';
            
            if (fileExt === 'txt' || fileExt === 'md' || fileExt === 'rtf') {
              fileTextContent = await fileBlob.text();
            } else if (fileExt === 'docx') {
              const arrayBuffer = await fileBlob.arrayBuffer();
              try {
                const mammoth = require('mammoth');
                const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
                fileTextContent = result.value;
              } catch (docxErr) {
                console.error(`Error reading docx context for ${file.name}:`, docxErr);
              }
            }

            // Knowledge base files (analyst-uploaded company manuals) are ALWAYS included.
            // Keyword filtering only applies to the user's own workspace files.
            const isKnowledgeBase = file.file_type === 'knowledge_base';
            const isExplicitSelection = selectedFileIds !== undefined;
            const matchesKeywords = keywords.length === 0 || keywords.some(kw => 
              file.name.toLowerCase().includes(kw) || fileTextContent.toLowerCase().includes(kw)
            );

            if (isKnowledgeBase || isExplicitSelection || matchesKeywords) {
              if (fileExt === 'pdf') {
                const arrayBuffer = await fileBlob.arrayBuffer();
                pdfAttachments.push({
                  data: Buffer.from(arrayBuffer),
                  mimeType: 'application/pdf'
                });
                fileReferenceContext += `\n\n--- Document: ${file.name} (Attached PDF) ---\n[This document is attached as a PDF file. Refer to the attached PDF for its full contents and layout.]\n`;
              } else {
                const cleanedText = FileProcessor.cleanToMarkdown(fileTextContent, file.name);
                if (cleanedText) {
                  fileReferenceContext += `\n\n--- Document: ${file.name} ---\n${cleanedText}\n`;
                }
              }
            }
          }
        }
      }

    // 5. Ingest profile metadata directly into grounding prompt to personalize output
    const marinerProfilePrompt = `
Vessel Particulars & Systems:
- Vessel Name: ${profile.vessel_name || 'N/A'} (Type: ${profile.vessel_type || 'N/A'})
- Operator: ${profile.operator_name || 'N/A'} | GRT: ${profile.grt || 'N/A'}
- Machinery config: ${profile.has_pump_room ? 'Traditional Pump Room' : `Deepwell pumps (${profile.pump_system_type || 'FRAMO'})`}
- Bow Thruster: ${profile.has_bow_thruster ? 'Fitted' : 'Not fitted'}
- Chemical Cargo capability: ${profile.carries_chemical_cargo ? 'Yes' : 'No'}
- EGCS (Scrubber): ${profile.has_egcs ? (profile.egcs_type || 'Open Loop') : 'None'}
- Active trading regions: US: ${!!profile.operates_us_waters}, AUS/NZ: ${!!profile.operates_aus_nz_waters}, EU: ${!!profile.operates_eu_waters}, China: ${!!profile.operates_chinese_waters}

Mariner Profile:
- Full Name: ${profile.full_name || 'N/A'}
- Rank: ${profile.rank || 'N/A'}
- Company: ${profile.company_name || 'N/A'}
- User Email: ${profile.email}
`;

    // 6. Run Grounded Query
    let processedResult = await gemini.runGroundedQuery(
      queryInput,
      `${marinerProfilePrompt}\n\n${fileReferenceContext}`,
      pdfAttachments,
      agent.system_prompt
    );

    const disclaimer = `\n\n***\n[DISCLAIMER: M.A.T.E is an agentic AI assistant designed to support maritime operations. AI systems can make mistakes. Please re-verify all safety parameters, gas measurements, and checklist controls with your official vessel SMS and statutory guidelines before executing operations.]`;
    processedResult += disclaimer;

    // 7. Increment limit and log interaction
    await supabase
      .from('usage_limits')
      .update({ interactions_count: limitCount + 1 })
      .eq('user_id', userId);

    // Calculate Token Usage & Cost
    const totalInputText = (queryInput || '') + '\n' + (marinerProfilePrompt || '') + '\n' + (fileReferenceContext || '') + '\n' + (agent.system_prompt || '');
    const inputTokens = Math.ceil(totalInputText.length / 4);
    const outputTokens = Math.ceil(processedResult.length / 4);
    
    // Gemini 2.5 Flash pay-as-you-go pricing (cost per 1M tokens)
    const isHighContext = inputTokens > 128000;
    const inputPricePerM = isHighContext ? 0.15 : 0.075;
    const outputPricePerM = isHighContext ? 0.60 : 0.30;
    
    const runCost = ((inputTokens * inputPricePerM) / 1000000) + ((outputTokens * outputPricePerM) / 1000000);

    await supabase
      .from('interactions_log')
      .insert({
        user_id: userId,
        subject: `Web Portal run: ${agent.name} - ${queryInput.substring(0, 30)}...`,
        status: 'Completed',
        agent_id: agentId,
        email_request: queryInput,
        email_response: processedResult,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        run_cost: parseFloat(runCost.toFixed(6)),
        routing_layer: 'Web Portal UI'
      });

    // Send email response if requested
    if (sendEmail) {
      try {
        const smtp = new SmtpService();
        await smtp.sendMail({
          to: profile.email,
          subject: `M.A.T.E Generated Response: ${agent.name}`,
          text: `Dear Officer,\n\nHere is the generated output from the M.A.T.E system for the agent slot: ${agent.name}.\n\n=== Generated Response ===\n\n${processedResult}\n\nBest regards,\nM.A.T.E Crew`
        });
      } catch (emailErr) {
        console.error("Failed to send agent response email:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      result: processedResult,
      interactionsLimit: `${limitCount + 1} / ${limitMax}`
    });

  } catch (error) {
    console.error('Error running web agent:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
