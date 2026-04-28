import type { NextFunction, Request, Response } from 'express';

import type { UserRole } from '@prisma/client';

import { verifyToken } from '../lib/jwt.js';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';

export type AuthedRequest = Request & {
  userId: string;
  role: UserRole;
};

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new HttpError(401, 'Missing bearer token');
    }
    const { sub, role } = verifyToken(token);
    (req as AuthedRequest).userId = sub;
    (req as AuthedRequest).role = role;
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const r = (req as AuthedRequest).role;
    if (!roles.includes(r)) {
      next(new HttpError(403, 'Forbidden for this role'));
      return;
    }
    next();
  };
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthedRequest).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      next(new HttpError(401, 'User not found'));
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}
