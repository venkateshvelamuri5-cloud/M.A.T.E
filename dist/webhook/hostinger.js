"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hostingerWebhookHandler = hostingerWebhookHandler;
const gemini_1 = require("../services/gemini");
const generator_1 = require("../services/generator");
const smtp_1 = require("../services/smtp");
// Simple mocked DB helper to simulate Supabase calls without forcing real connections
const dbMock = {
    async checkTokenLimits(email) {
        // In a production serverless environment, this executes a query:
        // SELECT * FROM usage_limits JOIN users ON users.id = usage_limits.user_id WHERE users.email = email;
        console.log(`[DB Mock] Verifying limits for email: ${email}`);
        return { valid: true, current: 1500, max: 50000 };
    },
    async logUsage(email, tokensUsed) {
        console.log(`[DB Mock] Logged usage of ${tokensUsed} tokens for ${email}`);
    }
};
/**
 * Hostinger Webhook Endpoint Handler
 * Designed to be serverless-compatible (e.g. Express routing, AWS Lambda API gateway or Vercel Serverless)
 */
async function hostingerWebhookHandler(req, res) {
    const gemini = new gemini_1.GeminiService();
    const generator = new generator_1.GeneratorService();
    const smtp = new smtp_1.SmtpService();
    try {
        // 1. Verify webhook security headers (Hostinger Webhook Authentication)
        const signature = req.headers['x-hostinger-signature'];
        const secret = process.env.WEBHOOK_SECRET;
        if (secret && signature !== secret) {
            res.status(401).json({ error: 'Unauthorized: Invalid webhook signature' });
            return;
        }
        // 2. Parse payload from Hostinger Agentic Mail
        // Expect body payload format containing sender information, email text structure, and attached files
        const { from, subject, bodyText, promptQuery, requestDocType } = req.body;
        if (!from || !bodyText) {
            res.status(400).json({ error: 'Bad Request: Missing from or bodyText fields' });
            return;
        }
        console.log(`Incoming webhook from: ${from} | Subject: ${subject || 'No Subject'}`);
        // 3. Early token-limit and subscription verification
        const limitCheck = await dbMock.checkTokenLimits(from);
        if (!limitCheck.valid || limitCheck.current >= limitCheck.max) {
            res.status(403).json({ error: 'Payment required: User has exceeded token usage limits' });
            return;
        }
        // 4. Handle uploaded files array if present (e.g. via multer middleware)
        const files = req.files;
        console.log(`Number of files attached to webhook request: ${files?.length || 0}`);
        // Read context if any file (like pdf or docx letterhead) is supplied
        let letterheadBuffer;
        let fileContextText = '';
        if (files && files.length > 0) {
            for (const file of files) {
                if (file.originalname.endsWith('.pdf')) {
                    console.log(`Processing attached PDF: ${file.originalname}`);
                    letterheadBuffer = file.buffer;
                }
                else if (file.originalname.endsWith('.docx')) {
                    console.log(`Processing attached Word Doc: ${file.originalname}`);
                    fileContextText += `[Context from file: ${file.originalname}]\n`;
                }
            }
        }
        // 5. Clean text inputs and scrub PII via Gemini
        const cleanedText = await gemini.cleanAndScrubText(bodyText);
        console.log('Successfully completed text PII scrubbing');
        // 6. Ground query utilizing reference context if a prompt query is supplied
        let finalAnswer = cleanedText;
        if (promptQuery) {
            const fullGroundingContext = `Email Text:\n${cleanedText}\n\nAttachments Context:\n${fileContextText}`;
            finalAnswer = await gemini.runGroundedQuery(promptQuery, fullGroundingContext);
            console.log('Successfully executed grounded query using Gemini');
        }
        // 7. Generation canvas logic (pdf-lib and docx)
        const emailAttachments = [];
        if (requestDocType === 'pdf') {
            const pdfBuffer = await generator.generatePDF(finalAnswer, letterheadBuffer);
            emailAttachments.push({
                filename: 'response-document.pdf',
                content: pdfBuffer,
                contentType: 'application/pdf'
            });
            console.log('PDF output generated successfully');
        }
        else if (requestDocType === 'docx') {
            const docxBuffer = await generator.generateDOCX(finalAnswer);
            emailAttachments.push({
                filename: 'response-document.docx',
                content: docxBuffer,
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });
            console.log('DOCX output generated successfully');
        }
        // 8. Mail outbound using SMTP Nodemailer back to user
        const emailSubject = `Response: ${subject || 'Agentic Assistant Processing'}`;
        const emailBody = `Hello,\n\nWe have successfully processed your request.\n\nSummary/Cleaned Text:\n${finalAnswer}\n\nBest regards,\nAgentic Backend`;
        const mailResponse = await smtp.sendMail({
            to: from,
            subject: emailSubject,
            text: emailBody,
            attachments: emailAttachments
        });
        // 9. Update DB usage tracking
        const estimatedTokens = Math.ceil(finalAnswer.length / 4); // basic calculation helper
        await dbMock.logUsage(from, estimatedTokens);
        res.status(200).json({
            success: true,
            messageId: mailResponse.messageId,
            mock: mailResponse.mock,
            tokensUsed: estimatedTokens
        });
    }
    catch (error) {
        console.error('Webhook error handler encountered exception:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
