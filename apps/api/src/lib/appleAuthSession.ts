import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

import { verifyAppleIdentityToken } from './appleSignIn.js';
import { HttpError } from './httpError.js';
import { signToken } from './jwt.js';
import { publicUser } from './googleSignIn.js';
import { prisma } from './prisma.js';

export type AppleSignInBody = {
  identityToken: string;
  /** Present on first authorization; may be omitted later (including Hide My Email). */
  email?: string | null;
  fullName?: string | null;
};

function isEmailVerified(value: boolean | string | undefined): boolean {
  return value === true || value === 'true';
}

function buildDisplayName(fullName: string | null | undefined, email: string | undefined): string {
  const fromApple = fullName?.trim();
  if (fromApple) return fromApple;
  if (email) {
    const local = email.split('@')[0]?.trim();
    if (local) return local;
  }
  return 'JO Rider';
}

/**
 * Create or link a user from a verified Apple identity token.
 * Prefers `appleSub` match, then email match (including private relay).
 */
export async function signInWithApple(body: AppleSignInBody) {
  const payload = await verifyAppleIdentityToken(body.identityToken);
  const appleSub = payload.sub;

  const tokenEmail = payload.email?.trim().toLowerCase() || undefined;
  const bodyEmail = body.email?.trim().toLowerCase() || undefined;
  const email = tokenEmail || bodyEmail;

  if (email && payload.email && !isEmailVerified(payload.email_verified) && !bodyEmail) {
    // Token email present but marked unverified — still accept Apple private relay emails.
  }

  let user = await prisma.user.findUnique({ where: { appleSub } });

  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.appleSub) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { appleSub },
      });
    }
  }

  if (!user) {
    if (!email) {
      throw new HttpError(
        400,
        'Apple did not share an email for this account. Sign in again and allow email sharing, or use an email that already has a JO account.',
      );
    }
    const passwordHash = await bcrypt.hash(randomUUID(), 12);
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: buildDisplayName(body.fullName, email),
        role: 'RIDER',
        appleSub,
      },
    });
  } else {
    const nextName = buildDisplayName(body.fullName, user.email);
    if ((!user.name || user.name === 'JO Rider') && nextName !== user.name) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: nextName },
      });
    }
  }

  const token = signToken({ sub: user.id, role: user.role });
  return { token, user: publicUser(user) };
}
