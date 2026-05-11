import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const getResend = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes('YOUR_KEY_HERE')) {
    console.error('[EmailService] CRITICAL: RESEND_API_KEY is missing or invalid in .env');
  }
  return new Resend(key);
};

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  text?: string;
}

/**
 * Core utility to send an email via Resend
 */
export async function sendEmail({ to, subject, html, from, text }: EmailPayload) {
  try {
    const resend = getResend();
    const fromAddress = from || process.env.RESEND_FROM || 'onboarding@resend.dev';
    
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || '',
    });

    if (error) {
      console.error('[EmailService] Error sending email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[EmailService] Unexpected error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Specialized helper for sending digital receipts
 */
export async function sendReceipt(email: string, invoiceNumber: string, grandTotal: number, items: any[]) {
  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name} x ${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${item.total.toFixed(2)}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
      <h2 style="color: #333;">Your Receipt from Vendora</h2>
      <p>Thank you for your purchase!</p>
      <p><strong>Invoice:</strong> ${invoiceNumber}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f9f9f9;">
            <th style="text-align: left; padding: 8px;">Item</th>
            <th style="text-align: right; padding: 8px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <div style="text-align: right; font-size: 1.2em; font-weight: bold;">
        Total: ${grandTotal.toFixed(2)}
      </div>
      <p style="margin-top: 30px; font-size: 0.8em; color: #777;">
        Vendora POS - Smart Retail Management
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Receipt for Order ${invoiceNumber}`,
    html,
  });
}
/**
 * Specialized helper for password reset
 */
export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 30px; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #3b82f6; margin: 0;">Vendora</h1>
        <p style="color: #6b7280; margin: 4px 0 0 0;">Secure POS Platform</p>
      </div>
      <h2 style="color: #1f2937;">Reset Your Password</h2>
      <p style="color: #4b5563; line-height: 1.6;">
        We received a request to reset your password. Click the button below to choose a new one. This link will expire in 1 hour.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
        <p style="margin-top: 16px; font-size: 0.8em; color: #9ca3af;">
          If the button doesn't work, copy and paste this link into your browser:
          <br />
          <code style="background: #f4f4f5; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-top: 8px; color: #3b82f6;">${resetLink}</code>
        </p>
      </div>
      <p style="color: #6b7280; font-size: 0.9em;">
        If you didn't request this, you can safely ignore this email. Your password will not change until you access the link above and create a new one.
      </p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 0.8em; color: #9ca3af; text-align: center;">
        Vendora POS - Smart Retail Management
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset your Vendora password',
    html,
  });
}
