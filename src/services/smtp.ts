import nodemailer from 'nodemailer';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

/**
 * SMTP Mailer Service
 * Integrates Nodemailer to route generated documents and agent answers back to recipients.
 */
export class SmtpService {
  private transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    // Initialize SMTP transport
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // Use SSL/TLS for port 465
      auth: {
        user,
        pass,
      },
    });
  }

  /**
   * Sends an outbound email with optional PDF/DOCX attachments
   */
  async sendMail(options: SendMailOptions): Promise<{ messageId?: string; mock?: boolean }> {
    const fromAddress = process.env.SMTP_USER || 'no-reply@simulated-domain.com';

    // If no credentials exist, simulate email delivery in console
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('--- SIMULATED SMTP EMAIL ---');
      console.log(`From: ${fromAddress}`);
      console.log(`To: ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      console.log(`Content: ${options.text.substring(0, 100)}...`);
      console.log(`Attachments: ${options.attachments?.map(a => `${a.filename} (${a.content.length} bytes)`).join(', ') || 'None'}`);
      console.log('-----------------------------');
      return { messageId: 'mock-id-' + Math.random().toString(36).substr(2, 9), mock: true };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"Agentic Assistant" <${fromAddress}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html || `<p>${options.text.replace(/\n/g, '<br>')}</p>`,
        attachments: options.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType
        }))
      });

      console.log(`Email successfully sent: ${info.messageId}`);
      return { messageId: info.messageId, mock: false };
    } catch (error) {
      console.error('Failed to send SMTP email:', error);
      throw new Error(`SMTP Mailer failed: ${(error as Error).message}`);
    }
  }
}
