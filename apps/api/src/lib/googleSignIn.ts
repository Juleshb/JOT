import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { TokenPayload } from 'google-auth-library';
import { OAuth2Client } from 'google-auth-library';

import { getGoogleClientIds } from './googleAuth.js';
import { HttpError } from './httpError.js';
import { signToken } from './jwt.js';
import { prisma } from './prisma.js';

const googleClient = new OAuth2Client();

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

export async function verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
  const googleClientIds = getGoogleClientIds();
  if (googleClientIds.length === 0) {
    throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured');
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientIds.length === 1 ? googleClientIds[0] : googleClientIds,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new HttpError(401, 'Invalid Google sign-in token');
    }
    return payload;
  } catch (e) {
    if (e instanceof HttpError) {
      throw e;
    }
    throw new HttpError(401, 'Invalid Google sign-in token');
  }
}

export async function exchangeGoogleAuthCode(code: string, redirectUri: string): Promise<string> {
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
    throw new HttpError(401, 'Could not complete Google sign-in');
  }
}

export async function signInWithGooglePayload(payload: TokenPayload) {
  if (!payload.email || payload.email_verified !== true) {
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
