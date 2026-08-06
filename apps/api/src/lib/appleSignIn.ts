import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { HttpError } from './httpError.js';

const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export type AppleTokenPayload = {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
};

function appleAudiences(): string[] {
  const fromEnv = (process.env.APPLE_CLIENT_ID ?? process.env.APPLE_BUNDLE_ID ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = ['rw.hblab.jotransportation'];
  return [...new Set([...fromEnv, ...defaults])];
}

/** Verify a Sign in with Apple identity token (JWT). */
export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleTokenPayload> {
  const audiences = appleAudiences();
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(identityToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: audiences.length === 1 ? audiences[0] : audiences,
    });
    payload = verified.payload;
  } catch {
    throw new HttpError(401, 'Invalid Apple sign-in token');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!sub) {
    throw new HttpError(401, 'Invalid Apple sign-in token');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : undefined;
  const emailVerified = payload.email_verified;

  return {
    sub,
    email,
    email_verified: emailVerified as boolean | string | undefined,
  };
}
