import Stripe from 'stripe';

import { HttpError } from './httpError.js';

let stripeSingleton: Stripe | null = null;

function normalizeStripeSecretKey(raw: string): string {
  let s = raw.trim().replace(/^\uFEFF/, '');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function assertValidStripeSecretKey(key: string): void {
  if (key.startsWith('pk_')) {
    throw new HttpError(
      500,
      'STRIPE_SECRET_KEY must be the secret key (sk_test_… or sk_live_…), not the publishable key (pk_…). Put pk_… in the web app as VITE_STRIPE_PUBLISHABLE_KEY only.',
    );
  }
  if (!/^sk_(test|live)_/.test(key)) {
    throw new HttpError(
      500,
      'Invalid STRIPE_SECRET_KEY. Secret keys start with sk_test_ or sk_live_. If apps/api/.env is correct, unset any shell copy (run `unset STRIPE_SECRET_KEY`) and restart the API, or ensure npm run dev is started from apps/api so .env loads.',
    );
  }
}

export function getStripeClient(): Stripe | null {
  const key = normalizeStripeSecretKey(process.env.STRIPE_SECRET_KEY ?? '');
  if (!key) {
    return null;
  }
  assertValidStripeSecretKey(key);
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}
