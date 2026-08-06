import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { jwtVerify, type JWTPayload } from 'jose';

import { getGoogleClientIds } from './googleAuth.js';
import {
  getGoogleJwksVerifier,
  googleTokenInfo,
  refreshGoogleJwksVerifier,
} from './googleJwks.js';
import { HttpError } from './httpError.js';
import { signToken } from './jwt.js';
import { prisma } from './prisma.js';

/** Subset of Google ID token claims we use after verification. */
export type GoogleIdTokenPayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
  };
}

/** Best-effort decode of JWT payload (no verify) — used only for clearer errors. */
function peekJwtAud(idToken: string): string | null {
  try {
    const part = idToken.split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const payload = JSON.parse(json) as { aud?: string | string[] };
    if (typeof payload.aud === 'string') return payload.aud;
    if (Array.isArray(payload.aud) && payload.aud[0]) return String(payload.aud[0]);
    return null;
  } catch {
    return null;
  }
}

function sanitizeVerifyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes('<!DOCTYPE') ||
    raw.includes('<html') ||
    raw.includes('Failed to retrieve verification certificates') ||
    raw.includes('Expected 200 OK from the JSON Web Key Set') ||
    raw.includes('Google JWKS HTTP') ||
    raw.includes('fetch failed')
  ) {
    return 'could not reach Google to verify the token (check API network / proxy)';
  }
  if (raw.length > 180) return `${raw.slice(0, 180)}…`;
  return raw;
}

function toGooglePayload(payload: JWTPayload): GoogleIdTokenPayload {
  return {
    sub: typeof payload.sub === 'string' ? payload.sub : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    email_verified: payload.email_verified as boolean | string | undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}

async function verifyWithJwks(
  idToken: string,
  audiences: string[],
): Promise<GoogleIdTokenPayload> {
  const verifyOpts = {
    issuer: GOOGLE_ISSUERS,
    audience: audiences.length === 1 ? audiences[0] : audiences,
  };

  try {
    const jwks = await getGoogleJwksVerifier();
    const verified = await jwtVerify(idToken, jwks, verifyOpts);
    return toGooglePayload(verified.payload);
  } catch (first) {
    // Key rotation or stale cache — refresh once.
    try {
      const jwks = await refreshGoogleJwksVerifier();
      const verified = await jwtVerify(idToken, jwks, verifyOpts);
      return toGooglePayload(verified.payload);
    } catch {
      throw first;
    }
  }
}

async function verifyWithTokenInfo(
  idToken: string,
  audiences: string[],
): Promise<GoogleIdTokenPayload> {
  const info = await googleTokenInfo(idToken);
  const aud = typeof info.aud === 'string' ? info.aud : '';
  if (!audiences.includes(aud)) {
    throw new Error(`tokeninfo audience mismatch: ${aud}`);
  }
  const iss = typeof info.iss === 'string' ? info.iss : '';
  if (!GOOGLE_ISSUERS.includes(iss)) {
    throw new Error(`tokeninfo issuer mismatch: ${iss}`);
  }
  return {
    sub: typeof info.sub === 'string' ? info.sub : undefined,
    email: typeof info.email === 'string' ? info.email : undefined,
    email_verified: info.email_verified as boolean | string | undefined,
    name: typeof info.name === 'string' ? info.name : undefined,
    picture: typeof info.picture === 'string' ? info.picture : undefined,
  };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenPayload> {
  const googleClientIds = getGoogleClientIds();
  if (googleClientIds.length === 0) {
    throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured');
  }

  const aud = peekJwtAud(idToken);
  if (aud && !googleClientIds.includes(aud)) {
    throw new HttpError(
      401,
      `Invalid Google sign-in token: audience mismatch. Token aud=${aud}`,
    );
  }

  try {
    return await verifyWithJwks(idToken, googleClientIds);
  } catch (jwksErr) {
    try {
      return await verifyWithTokenInfo(idToken, googleClientIds);
    } catch (tokenInfoErr) {
      console.error('[google] verifyIdToken failed', {
        tokenAud: aud,
        allowedAudiences: googleClientIds,
        jwks: jwksErr instanceof Error ? jwksErr.message : String(jwksErr),
        tokeninfo:
          tokenInfoErr instanceof Error ? tokenInfoErr.message : String(tokenInfoErr),
      });
      throw new HttpError(401, `Invalid Google sign-in token (${sanitizeVerifyError(jwksErr)})`);
    }
  }
}

export async function exchangeGoogleAuthCode(code: string, redirectUri: string): Promise<string> {
  // Installed-app redirects (com.googleusercontent.apps…:/oauthredirect) must never be
  // exchanged with the Web client secret — only the Expo HTTPS proxy uses this path.
  if (!redirectUri.startsWith('https://')) {
    throw new HttpError(
      400,
      'Google code exchange is only for Expo Go (https://auth.expo.io/…). On a native build, use the id_token from Google instead.',
    );
  }

  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!secret) {
    throw new HttpError(
      500,
      'GOOGLE_CLIENT_SECRET is not configured. In Google Cloud Console, open your Web OAuth client, create a client secret, and add it to apps/api/.env',
    );
  }

  const webClientId =
    process.env.GOOGLE_WEB_CLIENT_ID?.trim().replace(/^["']|["']$/g, '') ||
    getGoogleClientIds()[0];
  if (!webClientId) {
    throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured');
  }

  const oauth2 = new OAuth2Client(webClientId, secret, redirectUri);
  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.id_token) {
      throw new HttpError(401, 'Google did not return a sign-in token');
    }
    return tokens.id_token;
  } catch (e) {
    if (e instanceof HttpError) {
      throw e;
    }
    console.error('[google] code exchange failed', {
      redirectUri,
      webClientId,
      message: e instanceof Error ? e.message : String(e),
    });
    throw new HttpError(
      401,
      'Could not complete Google sign-in. Check production GOOGLE_CLIENT_SECRET matches the Web OAuth client, and that redirect URI is authorized: ' +
        redirectUri,
    );
  }
}

export async function signInWithGooglePayload(payload: GoogleIdTokenPayload) {
  const verifiedRaw = payload.email_verified;
  const emailVerified = verifiedRaw === true || verifiedRaw === 'true';
  if (!payload.email || !emailVerified) {
    throw new HttpError(401, 'Google account email is not verified');
  }

  const email = payload.email.trim().toLowerCase();
  const displayName = payload.name?.trim() || email.split('@')[0];
  const avatarUrl = payload.picture ?? null;

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(randomUUID(), 12);
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: displayName,
        avatarUrl,
        role: 'RIDER',
      },
    });
  } else if (avatarUrl && user.avatarUrl !== avatarUrl) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });
  }

  const token = signToken({ sub: user.id, role: user.role });
  return { token, user: publicUser(user) };
}
