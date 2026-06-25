import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import { GeminiService } from '../../../../src/services/gemini';
import { SmtpService } from '../../../../src/services/smtp';

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
      .select('email, full_name, rank, company_name, subscription_plan')
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

    if (targetFileIds && targetFileIds.length > 0) {
      const { data: files } = await supabase
        .from('user_files')
        .select('*')
        .in('id', targetFileIds)
        .or(`user_id.eq.${userId},file_type.eq.knowledge_base`);

      if (files && files.length > 0) {
        for (const file of files) {
          const { data: fileBlob } = await supabase.storage
            .from('user-spaces')
            .download(file.storage_path);

          if (fileBlob) {
            const fileExt = (file.file_type || '').toLowerCase();
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

            // Strategy 2: Check if file is relevant based on keyword match
            const isExplicitSelection = selectedFileIds !== undefined;
            const matchesKeywords = keywords.length === 0 || keywords.some(kw => 
              file.name.toLowerCase().includes(kw) || fileTextContent.toLowerCase().includes(kw)
            );

            if (isExplicitSelection || matchesKeywords) {
              if (fileExt === 'pdf') {
                const arrayBuffer = await fileBlob.arrayBuffer();
                pdfAttachments.push({
                  data: Buffer.from(arrayBuffer),
                  mimeType: 'application/pdf'
                });
              } else {
                fileReferenceContext += `\n\n--- Document: ${file.name} ---\n${fileTextContent}\n`;
              }
            }
          }
        }
      }
    }

    // 5. Ingest profile metadata directly into grounding prompt to personalize output
    const marinerProfilePrompt = `
Mariner Profile Information:
- Full Name: ${profile.full_name || 'N/A'}
- Rank: ${profile.rank || 'N/A'}
- Company: ${profile.company_name || 'N/A'}
- User Email: ${profile.email}
`;

    // 6. Run Gemini Grounded Query
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

    await supabase
      .from('interactions_log')
      .insert({
        user_id: userId,
        subject: `Web Portal run: ${agent.name} - ${queryInput.substring(0, 30)}...`,
        status: 'Completed',
        agent_id: agentId,
        email_request: queryInput,
        email_response: processedResult
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
