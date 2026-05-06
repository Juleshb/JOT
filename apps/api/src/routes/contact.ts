import { Router } from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';

const router = Router();

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(6).max(40).optional(),
  company: z.string().trim().max(120).optional(),
  preferredContactMethod: z.enum(['EMAIL', 'PHONE']).optional(),
  topic: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(4000),
});

function emailShell(opts: { title: string; subtitle: string; bodyHtml: string }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F5EFE6;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#2d100f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5EFE6;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#FFFCF9;border:1px solid #e8dfd6;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#4a1515;padding:18px 22px;">
                <div style="font-size:22px;line-height:1.2;font-weight:700;color:#ffffff;">JO Transportation</div>
                <div style="margin-top:6px;font-size:13px;line-height:1.4;color:#f2e3bb;">${opts.subtitle}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px;">
                <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#3d1212;">${opts.title}</h1>
                ${opts.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e8dfd6;padding:14px 22px;font-size:12px;color:#5a4540;">
                JO Transportation · Dallas - Fort Worth, Texas, USA
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function infoRow(label: string, value: string) {
  return `<tr><td style="padding:8px 10px;border:1px solid #e8dfd6;font-size:13px;color:#4b2220;background:#ffffff;"><strong>${label}</strong></td><td style="padding:8px 10px;border:1px solid #e8dfd6;font-size:13px;color:#2d100f;background:#ffffff;">${value}</td></tr>`;
}

function createTransporter() {
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = String(process.env.SMTP_SECURE ?? 'true') === 'true';
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!user || !pass) {
    throw new HttpError(503, 'Email service is not configured');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

router.post('/', async (req, res, next) => {
  try {
    const body = contactSchema.parse(req.body);
    const companyEmail = process.env.CONTACT_COMPANY_EMAIL?.trim() || process.env.SMTP_USER?.trim();
    const companyAddress =
      process.env.COMPANY_ADDRESS?.trim() || 'Dallas - Fort Worth, Texas, USA';

    if (!companyEmail) {
      throw new HttpError(503, 'Company contact email is not configured');
    }

    const transporter = createTransporter();
    const fromName = process.env.SMTP_FROM_NAME?.trim() || 'JO Transportation';
    const fromAddress = process.env.SMTP_FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim();
    if (!fromAddress) {
      throw new HttpError(503, 'From email is not configured');
    }

    const companySubject = `[Contact] ${body.topic} - ${body.name}`;
    const companyText = [
      'New contact message',
      '',
      `Name: ${body.name}`,
      `Email: ${body.email}`,
      `Phone: ${body.phone || 'Not provided'}`,
      `Company: ${body.company || 'Not provided'}`,
      `Preferred contact: ${body.preferredContactMethod === 'PHONE' ? 'Phone' : 'Email'}`,
      `Topic: ${body.topic}`,
      '',
      'Message:',
      body.message,
      '',
      `Company address: ${companyAddress}`,
    ].join('\n');

    const userSubject = 'We received your message - JO Transportation';
    const userText = [
      `Hi ${body.name},`,
      '',
      'Thanks for contacting JO Transportation. Your message has been received.',
      'Our team will review it and reply as soon as possible.',
      '',
      `Preferred contact: ${body.preferredContactMethod === 'PHONE' ? 'Phone' : 'Email'}`,
      body.phone ? `Phone: ${body.phone}` : 'Phone: Not provided',
      body.company ? `Company: ${body.company}` : 'Company: Not provided',
      '',
      `Topic: ${body.topic}`,
      '',
      'Your message:',
      body.message,
      '',
      `Company address: ${companyAddress}`,
      '',
      'Best regards,',
      'JO Transportation Support',
    ].join('\n');

    const companyHtml = emailShell({
      title: 'New Contact Message',
      subtitle: 'Inbound contact form notification',
      bodyHtml: `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 14px;">
          ${infoRow('Name', body.name)}
          ${infoRow('Email', body.email)}
          ${infoRow('Phone', body.phone || 'Not provided')}
          ${infoRow('Company', body.company || 'Not provided')}
          ${infoRow('Preferred contact', body.preferredContactMethod === 'PHONE' ? 'Phone' : 'Email')}
          ${infoRow('Topic', body.topic)}
        </table>
        <div style="font-size:14px;font-weight:600;color:#4a1515;margin:10px 0 8px;">Message</div>
        <div style="white-space:pre-wrap;background:#ffffff;border:1px solid #e8dfd6;border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.55;color:#3d2a28;">${body.message}</div>
      `,
    });

    const userHtml = emailShell({
      title: `Hi ${body.name}, we received your message`,
      subtitle: 'Contact confirmation',
      bodyHtml: `
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3d2a28;">
          Thank you for contacting JO Transportation. Our team has received your message and will reply as soon as possible.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 14px;">
          ${infoRow('Topic', body.topic)}
          ${infoRow('Preferred contact', body.preferredContactMethod === 'PHONE' ? 'Phone' : 'Email')}
          ${infoRow('Phone', body.phone || 'Not provided')}
          ${infoRow('Company', body.company || 'Not provided')}
        </table>
        <div style="font-size:14px;font-weight:600;color:#4a1515;margin:10px 0 8px;">Your message</div>
        <div style="white-space:pre-wrap;background:#ffffff;border:1px solid #e8dfd6;border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.55;color:#3d2a28;">${body.message}</div>
      `,
    });

    await Promise.all([
      transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: companyEmail,
        replyTo: body.email,
        subject: companySubject,
        text: companyText,
        html: companyHtml,
      }),
      transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: body.email,
        subject: userSubject,
        text: userText,
        html: userHtml,
      }),
    ]);

    res.json({ ok: true, message: 'Message received. We emailed you a confirmation.' });
  } catch (e) {
    next(e);
  }
});

export default router;

