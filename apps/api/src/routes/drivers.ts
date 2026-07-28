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

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfLocalWeek(d = new Date()): Date {
  const x = startOfLocalDay(d);
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? 6 : day - 1; // Monday start
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfLocalMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function rideEarnedAmount(ride: { fareFinal: number | null; fareEstimate: number | null }): number {
  const amount = ride.fareFinal ?? ride.fareEstimate;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Driver earnings report from completed trips. */
router.get('/me/earnings', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const rides = await prisma.ride.findMany({
      where: {
        driverId: userId,
        status: 'COMPLETED',
      },
      select: {
        id: true,
        fareFinal: true,
        fareEstimate: true,
        completedAt: true,
        createdAt: true,
        paymentMethod: true,
      },
      orderBy: { completedAt: 'desc' },
    });

    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const weekStart = startOfLocalWeek(now);
    const monthStart = startOfLocalMonth(now);

    let totalEarned = 0;
    let todayEarned = 0;
    let weekEarned = 0;
    let monthEarned = 0;
    let cashEarned = 0;
    let cardEarned = 0;

    for (const ride of rides) {
      const amount = rideEarnedAmount(ride);
      totalEarned += amount;
      const when = ride.completedAt ?? ride.createdAt;
      if (when >= dayStart) todayEarned += amount;
      if (when >= weekStart) weekEarned += amount;
      if (when >= monthStart) monthEarned += amount;
      if (ride.paymentMethod === 'CARD') cardEarned += amount;
      else cashEarned += amount;
    }

    const completedTrips = rides.length;
    res.json({
      currency: 'USD',
      completedTrips,
      totalEarned: roundMoney(totalEarned),
      todayEarned: roundMoney(todayEarned),
      weekEarned: roundMoney(weekEarned),
      monthEarned: roundMoney(monthEarned),
      averagePerTrip: completedTrips > 0 ? roundMoney(totalEarned / completedTrips) : 0,
      byPaymentMethod: {
        cash: roundMoney(cashEarned),
        card: roundMoney(cardEarned),
      },
    });
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
