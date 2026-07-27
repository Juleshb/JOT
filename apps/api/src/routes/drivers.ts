import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import {
  emitAdminDriverOffline,
  emitAdminDriverOnline,
} from '../socket.js';
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
    if (body.isOnline) {
      const lat = body.lat;
      const lng = body.lng;
      if (
        lat == null ||
        lng == null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        throw new HttpError(400, 'lat and lng are required when going online');
      }
    }
    const updated = await prisma.driverProfile.update({
      where: { userId },
      data: {
        isOnline: body.isOnline,
        currentLat: body.isOnline
          ? body.lat!
          : body.lat ?? profile.currentLat,
        currentLng: body.isOnline
          ? body.lng!
          : body.lng ?? profile.currentLng,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
        },
      },
    });

    if (body.isOnline && updated.verificationStatus === 'APPROVED') {
      emitAdminDriverOnline({
        userId: updated.userId,
        name: updated.user.name,
        email: updated.user.email,
        phone: updated.user.phone,
        avatarUrl: updated.user.avatarUrl,
        lat: updated.currentLat,
        lng: updated.currentLng,
        vehicleMake: updated.vehicleMake,
        vehicleModel: updated.vehicleModel,
        vehicleColor: updated.vehicleColor,
        licensePlate: updated.licensePlate,
        averageRiderRating: updated.averageRiderRating,
        riderRatingCount: updated.riderRatingCount,
        updatedAt: updated.updatedAt,
      });
    } else if (!body.isOnline) {
      emitAdminDriverOffline(userId);
    }

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

const vehicleSchema = z.object({
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  color: z.string().min(1).max(40),
  licensePlate: z.string().min(1).max(20),
});

router.patch('/me/vehicle', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const body = vehicleSchema.parse(req.body);
    const { userId } = req as AuthedRequest;
    const profile = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new HttpError(404, 'Driver profile not found');
    }

    const updated = await prisma.driverProfile.update({
      where: { userId },
      data: {
        vehicleMake: body.make.trim(),
        vehicleModel: body.model.trim(),
        vehicleColor: body.color.trim(),
        licensePlate: body.licensePlate.trim().toUpperCase(),
      },
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
