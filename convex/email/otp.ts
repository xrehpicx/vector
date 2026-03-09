'use node';

import nodemailer from 'nodemailer';
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';

export type OtpEmailType = 'sign-in' | 'email-verification' | 'forget-password';

const colors = {
  bg: '#f5f7fb',
  panel: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
};

function otpEmailHtml({
  title,
  description,
  otp,
}: {
  title: string;
  description: string;
  otp: string;
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0; background-color:${colors.bg}; font-family:Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; color:${colors.text}; padding:24px 0;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width:580px; background-color:${colors.panel}; border:1px solid ${colors.border}; border-radius:16px; overflow:hidden;">
    <tr><td style="padding:24px 24px 8px;">
      <h1 style="margin:0 0 8px; font-size:24px; line-height:30px; font-weight:700;">${title}</h1>
      <p style="margin:0 0 16px; font-size:14px; line-height:22px; color:${colors.muted};">${description}</p>
    </td></tr>
    <tr><td style="padding:0 24px;">
      <div style="border:1px solid ${colors.border}; border-radius:12px; padding:24px; text-align:center;">
        <div style="font-family:'SFMono-Regular', Menlo, Monaco, Consolas, monospace; font-weight:700; font-size:32px; letter-spacing:8px;">${otp}</div>
        <div style="margin-top:8px; color:${colors.muted}; font-size:13px;">Enter this code in the verification form</div>
      </div>
    </td></tr>
    <tr><td style="padding:16px 24px 0;">
      <p style="margin:0; color:${colors.muted}; font-size:13px;">This code expires in 15 minutes.</p>
    </td></tr>
    <tr><td><hr style="border:none; border-top:1px solid ${colors.border}; margin:24px 0 0;" /></td></tr>
    <tr><td style="padding:12px 24px 20px;">
      <p style="margin:0; font-size:12px; line-height:18px; color:${colors.muted};">If you didn't request this, you can safely ignore this email.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

const templates: Record<
  OtpEmailType,
  { subject: string; title: string; description: string }
> = {
  'sign-in': {
    subject: 'Sign in to Vector',
    title: 'Sign in to Vector',
    description: 'Use the 4-digit code below to sign in:',
  },
  'email-verification': {
    subject: 'Verify your email — Vector',
    title: 'Verify your email',
    description: 'Use the 4-digit code below to verify your email address:',
  },
  'forget-password': {
    subject: 'Reset your password — Vector',
    title: 'Reset your password',
    description: 'Use the 4-digit code below to reset your password:',
  },
};

export const sendOtpEmail = internalAction({
  args: {
    to: v.string(),
    otp: v.string(),
    type: v.union(
      v.literal('sign-in'),
      v.literal('email-verification'),
      v.literal('forget-password'),
    ),
  },
  handler: async (_ctx, { to, otp, type }) => {
    const template = templates[type];
    const html = otpEmailHtml({
      title: template.title,
      description: template.description,
      otp,
    });

    const host = process.env.SMTP_HOST;
    if (!host) {
      console.info(`[otp:email:fallback] ${type} for ${to}: ${otp}`);
      return;
    }

    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from:
        process.env.SMTP_FROM ??
        process.env.SMTP_USER ??
        'Vector <no-reply@vector.local>',
      to,
      subject: template.subject,
      html,
    });
  },
});
