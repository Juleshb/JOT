import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

const pushTokenSchema = z.object({
  token: z
    .string()
    .min(20)
    .max(200)
    .refine(
      (t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['),
      'Invalid Expo push token',
    ),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});

/** Register or refresh the signed-in user's Expo push token. */
router.post('/push-token', requireAuth, async (req, res, next) => {
  try {
    const body = pushTokenSchema.parse(req.body);
    const { userId } = req as AuthedRequest;

    // One token → one user (device switched accounts).
    await prisma.user.updateMany({
      where: { expoPushToken: body.token, NOT: { id: userId } },
      data: { expoPushToken: null, pushPlatform: null, pushTokenUpdatedAt: null },
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        expoPushToken: body.token,
        pushPlatform: body.platform ?? null,
        pushTokenUpdatedAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Clear push token on logout (optional; client may call with the token). */
router.delete('/push-token', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const token =
      typeof req.body?.token === 'string'
        ? req.body.token
        : typeof req.query.token === 'string'
          ? req.query.token
          : undefined;

    if (token) {
      await prisma.user.updateMany({
        where: { id: userId, expoPushToken: token },
        data: { expoPushToken: null, pushPlatform: null, pushTokenUpdatedAt: null },
      });
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: { expoPushToken: null, pushPlatform: null, pushTokenUpdatedAt: null },
      });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.use((_req, _res, next) => {
  next(new HttpError(404, 'Not found'));
});

export default router;
