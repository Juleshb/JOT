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

    await Promise.all([
      transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: companyEmail,
        replyTo: body.email,
        subject: companySubject,
        text: companyText,
      }),
      transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: body.email,
        subject: userSubject,
        text: userText,
      }),
    ]);

    res.json({ ok: true, message: 'Message received. We emailed you a confirmation.' });
  } catch (e) {
    next(e);
  }
});

export default router;

