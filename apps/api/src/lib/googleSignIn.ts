import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { getGoogleClientIds } from './googleAuth.js';
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
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

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
  // Never leak Google HTML error pages into API responses.
  if (raw.includes('<!DOCTYPE') || raw.includes('<html') || raw.includes('Failed to retrieve verification certificates')) {
    return 'could not reach Google to verify the token (network/proxy blocked googleapis.com)';
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
    const verified = await jwtVerify(idToken, googleJwks, {
      issuer: GOOGLE_ISSUERS,
      audience: googleClientIds.length === 1 ? googleClientIds[0] : googleClientIds,
    });
    return toGooglePayload(verified.payload);
  } catch (e) {
    console.error('[google] verifyIdToken failed', {
      tokenAud: aud,
      allowedAudiences: googleClientIds,
      message: e instanceof Error ? e.message : String(e),
    });
    throw new HttpError(401, `Invalid Google sign-in token (${sanitizeVerifyError(e)})`);
  }
}

export async function exchangeGoogleAuthCode(code: string, redirectUri: string): Promise<string> {
  // Installed-app redirects (com.googleusercontent.apps…:/oauthredirect) must never be
  // exchanged with the Web client secret — only the Expo HTTPS proxy uses this path.
  if (!redirectUri.startsWith('https://')) {
    throw new HttpError(
      400,
      'Google code exchange is only supported for the Expo auth proxy (https://). Native iOS/Android must send an id_token to POST /auth/google.',
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
      'Could not complete Google sign-in. Check GOOGLE_CLIENT_SECRET and that this redirect URI is authorized on the Web OAuth client: ' +
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
