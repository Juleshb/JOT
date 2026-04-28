import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

const statusSchema = z.object({
  isOnline: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

router.patch('/me/status', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const body = statusSchema.parse(req.body);
    const { userId } = req as AuthedRequest;
    const profile = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new HttpError(404, 'Driver profile not found');
    }
    if (profile.verificationStatus !== 'APPROVED') {
      throw new HttpError(403, 'Driver not verified');
    }
    const updated = await prisma.driverProfile.update({
      where: { userId },
      data: {
        isOnline: body.isOnline,
        currentLat: body.lat ?? profile.currentLat,
        currentLng: body.lng ?? profile.currentLng,
      },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
