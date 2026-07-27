import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import Stripe from 'stripe';
import { ZodError } from 'zod';

import { HttpError } from '../lib/httpError.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Image too large (max 8 MB)'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Too many images (max 12 per upload)'
          : err.message || 'Upload failed';
    res.status(400).json({ error: message });
    return;
  }
  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    console.error(err);
    res.status(401).json({
      error:
        'Stripe rejected STRIPE_SECRET_KEY (invalid, revoked, or rolled). In Stripe Dashboard → Developers → API keys, reveal or roll the Secret key, paste it into apps/api/.env, restart the API, and try again.',
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
