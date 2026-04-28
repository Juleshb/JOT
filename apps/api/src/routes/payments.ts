import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { getStripeClient } from '../lib/stripe.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

const rideIntentSchema = z.object({
  amountUsd: z.number().positive(),
});

/** Stripe minimum for USD is $0.50; we align with app fare floor (~$6.50). */
const STRIPE_MIN_USD = 0.5;
const APP_MIN_FARE_USD = 6.5;

router.post('/ride-intent', requireAuth, requireRole('RIDER'), async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new HttpError(503, 'Card payments are not configured (missing STRIPE_SECRET_KEY)');
    }

    const body = rideIntentSchema.parse(req.body);
    const { userId } = req as AuthedRequest;

    const amountUsd = Math.max(STRIPE_MIN_USD, APP_MIN_FARE_USD, body.amountUsd);
    const amountCents = Math.round(amountUsd * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        riderId: userId,
        amountUsd: amountUsd.toFixed(2),
      },
    });

    if (!paymentIntent.client_secret) {
      throw new HttpError(500, 'Could not start payment');
    }

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
