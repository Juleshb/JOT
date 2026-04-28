import jwt from 'jsonwebtoken';

import type { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me';
const EXPIRES = '7d';

export type JwtPayload = {
  sub: string;
  role: UserRole;
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  return decoded;
}
