import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { getStripeClient } from '../lib/stripe.js';
import { broadcastRideOffer, emitRideUpdate, emitToUser } from '../socket.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

function rideIdFromParams(req: { params: { id?: string | string[] } }): string {
  const raw = req.params.id;
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === 'string') {
    return raw[0];
  }
  return '';
}

const createRideSchema = z.object({
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string().min(1),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  dropoffAddress: z.string().min(1),
  fareEstimate: z.number().optional(),
  preferredDriverId: z.string().min(1).optional(),
  paymentMethod: z.enum(['CASH', 'CARD']).optional(),
  paymentStatus: z.enum(['PENDING', 'COMPLETED']).optional(),
  stripePaymentIntentId: z.string().min(1).optional(),
});

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

router.get('/nearby-drivers', requireAuth, requireRole('RIDER'), async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new HttpError(400, 'lat and lng query params are required');
    }

    const candidates = await prisma.driverProfile.findMany({
      where: {
        isOnline: true,
        verificationStatus: 'APPROVED',
        currentLat: { not: null },
        currentLng: { not: null },
      },
      include: { user: { select: { id: true, name: true, phone: true } } },
      take: 30,
    });

    const nearby = candidates
      .map((d) => ({
        userId: d.userId,
        name: d.user.name,
        phone: d.user.phone,
        vehicleMake: d.vehicleMake,
        vehicleModel: d.vehicleModel,
        vehicleColor: d.vehicleColor,
        licensePlate: d.licensePlate,
        km: haversineKm(lat, lng, d.currentLat!, d.currentLng!),
      }))
      .filter((d) => d.km <= 15)
      .sort((a, b) => a.km - b.km)
      .slice(0, 10);

    res.json(nearby);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireAuth, requireRole('RIDER'), async (req, res, next) => {
  try {
    const body = createRideSchema.parse(req.body);
    const { userId } = req as AuthedRequest;
    const active = await prisma.ride.findFirst({
      where: {
        riderId: userId,
        status: { in: ['REQUESTED', 'ACCEPTED', 'STARTED'] },
      },
    });
    if (active) {
      throw new HttpError(409, 'You already have an active ride');
    }
    let preferredDriverId: string | null = null;
    if (body.preferredDriverId) {
      const profile = await prisma.driverProfile.findUnique({
        where: { userId: body.preferredDriverId },
      });
      if (!profile || !profile.isOnline || profile.verificationStatus !== 'APPROVED') {
        throw new HttpError(400, 'Selected driver is not available right now');
      }
      if (profile.currentLat == null || profile.currentLng == null) {
        throw new HttpError(400, 'Selected driver location is unavailable');
      }
      const km = haversineKm(body.pickupLat, body.pickupLng, profile.currentLat, profile.currentLng);
      if (km > 15) {
        throw new HttpError(400, 'Selected driver is too far from pickup');
      }
      preferredDriverId = body.preferredDriverId;
    }
    const paymentMethod = body.paymentMethod ?? 'CASH';
    const paymentStatus = body.paymentStatus ?? 'COMPLETED';

    let stripePaymentIntentId: string | null = null;

    if (paymentMethod === 'CARD') {
      const stripe = getStripeClient();
      if (!stripe) {
        throw new HttpError(503, 'Card payments are not configured');
      }
      if (body.fareEstimate == null || Number.isNaN(body.fareEstimate)) {
        throw new HttpError(400, 'Fare estimate is required for card rides');
      }
      if (!body.stripePaymentIntentId) {
        throw new HttpError(400, 'stripePaymentIntentId is required for card rides');
      }

      const pi = await stripe.paymentIntents.retrieve(body.stripePaymentIntentId);

      if (pi.metadata.riderId !== userId) {
        throw new HttpError(403, 'This payment does not belong to your account');
      }
      if (pi.status !== 'succeeded') {
        throw new HttpError(402, `Payment is not complete (status: ${pi.status})`);
      }

      const expectedCents = Math.round(body.fareEstimate * 100);
      if (pi.amount !== expectedCents) {
        throw new HttpError(400, 'Payment amount does not match the ride fare');
      }

      stripePaymentIntentId = pi.id;
    }

    const ride = await prisma.ride.create({
      data: {
        riderId: userId,
        driverId: preferredDriverId,
        status: 'REQUESTED',
        pickupLat: body.pickupLat,
        pickupLng: body.pickupLng,
        pickupAddress: body.pickupAddress,
        dropoffLat: body.dropoffLat,
        dropoffLng: body.dropoffLng,
        dropoffAddress: body.dropoffAddress,
        fareEstimate: body.fareEstimate ?? null,
        paymentMethod,
        paymentStatus,
        stripePaymentIntentId,
      },
      include: { rider: { select: { id: true, name: true } } },
    });

    const driverIds = preferredDriverId ? [preferredDriverId] : [];
    if (!preferredDriverId) {
      const candidates = await prisma.driverProfile.findMany({
        where: {
          isOnline: true,
          verificationStatus: 'APPROVED',
          currentLat: { not: null },
          currentLng: { not: null },
        },
        take: 20,
      });
      const nearby = candidates
        .map((d) => ({
          userId: d.userId,
          km: haversineKm(body.pickupLat, body.pickupLng, d.currentLat!, d.currentLng!),
        }))
        .filter((c) => c.km <= 15)
        .sort((a, b) => a.km - b.km)
        .slice(0, 8);
      driverIds.push(...nearby.map((n) => n.userId));
    }
    broadcastRideOffer(driverIds, {
      rideId: ride.id,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      fareEstimate: ride.fareEstimate,
      riderName: ride.rider.name,
    });
    if (preferredDriverId) {
      emitToUser(userId, 'ride:progress', {
        rideId: ride.id,
        stage: 'DRIVER_VIEWED_REQUEST',
        message: 'Driver viewed request',
      });
    }

    res.status(201).json(ride);
  } catch (e) {
    next(e);
  }
});

router.get('/active', requireAuth, async (req, res, next) => {
  try {
    const { userId, role } = req as AuthedRequest;
    const ride = await prisma.ride.findFirst({
      where:
        role === 'RIDER'
          ? { riderId: userId, status: { in: ['REQUESTED', 'ACCEPTED', 'STARTED'] } }
          : { driverId: userId, status: { in: ['ACCEPTED', 'STARTED'] } },
      include: {
        rider: { select: { id: true, name: true, phone: true } },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            driverProfile: {
              select: {
                currentLat: true,
                currentLng: true,
                isOnline: true,
              },
            },
          },
        },
      },
    });
    res.json(ride);
  } catch (e) {
    next(e);
  }
});

router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const { userId, role } = req as AuthedRequest;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const rides = await prisma.ride.findMany({
      where: role === 'RIDER' ? { riderId: userId } : { driverId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        rider: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
    });
    res.json(rides);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/accept', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const rideId = rideIdFromParams(req);
    if (!rideId) {
      throw new HttpError(400, 'Missing ride id');
    }
    const profile = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile?.isOnline || profile.verificationStatus !== 'APPROVED') {
      throw new HttpError(403, 'Go online as an approved driver to accept rides');
    }
    const ride = await prisma.$transaction(async (tx) => {
      const current = await tx.ride.findFirst({
        where: { id: rideId, status: 'REQUESTED' },
      });
      if (!current) {
        throw new HttpError(404, 'Ride not available');
      }
      const updated = await tx.ride.updateMany({
        where: {
          id: rideId,
          status: 'REQUESTED',
          OR: [{ driverId: null }, { driverId: userId }],
        },
        data: {
          driverId: userId,
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new HttpError(409, 'Ride already assigned');
      }
      return tx.ride.findUnique({
        where: { id: rideId },
        include: {
          rider: { select: { id: true, name: true, phone: true } },
          driver: { select: { id: true, name: true, phone: true } },
        },
      });
    });
    if (ride) {
      emitRideUpdate(ride.id, { rideId: ride.id, status: ride.status, ride });
      emitToUser(ride.riderId, 'ride:progress', {
        rideId: ride.id,
        stage: 'DRIVER_EN_ROUTE',
        message: 'Driver en route to pickup',
      });
    }
    res.json(ride);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/start', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const rideId = rideIdFromParams(req);
    if (!rideId) {
      throw new HttpError(400, 'Missing ride id');
    }
    const ride = await prisma.ride.updateMany({
      where: { id: rideId, driverId: userId, status: 'ACCEPTED' },
      data: { status: 'STARTED', startedAt: new Date() },
    });
    if (ride.count === 0) {
      throw new HttpError(404, 'Ride not found or not in ACCEPTED state');
    }
    const full = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        rider: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
    });
    emitRideUpdate(rideId, { rideId, status: 'STARTED', ride: full });
    res.json(full);
  } catch (e) {
    next(e);
  }
});

const completeSchema = z.object({
  fareFinal: z.number().optional(),
});

const riderPaymentSchema = z.object({
  paymentMethod: z.enum(['CASH', 'CARD']),
  fareEstimate: z.number().optional(),
  stripePaymentIntentId: z.string().min(1).optional(),
});

router.post('/:id/payment', requireAuth, requireRole('RIDER'), async (req, res, next) => {
  try {
    const body = riderPaymentSchema.parse(req.body);
    const { userId } = req as AuthedRequest;
    const rideId = rideIdFromParams(req);
    if (!rideId) {
      throw new HttpError(400, 'Missing ride id');
    }

    const ride = await prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride || ride.riderId !== userId) {
      throw new HttpError(404, 'Ride not found');
    }
    if (!['REQUESTED', 'ACCEPTED'].includes(ride.status)) {
      throw new HttpError(409, 'Ride payment cannot be updated in current state');
    }

    let stripePaymentIntentId: string | null = null;
    let nextFareEstimate = ride.fareEstimate ?? null;
    if (typeof body.fareEstimate === 'number' && !Number.isNaN(body.fareEstimate)) {
      nextFareEstimate = body.fareEstimate;
    }

    if (body.paymentMethod === 'CARD') {
      const stripe = getStripeClient();
      if (!stripe) {
        throw new HttpError(503, 'Card payments are not configured');
      }
      if (!body.stripePaymentIntentId) {
        throw new HttpError(400, 'stripePaymentIntentId is required for card rides');
      }
      if (nextFareEstimate == null || Number.isNaN(nextFareEstimate)) {
        throw new HttpError(400, 'Fare estimate is required for card rides');
      }

      const pi = await stripe.paymentIntents.retrieve(body.stripePaymentIntentId);
      if (pi.metadata.riderId !== userId) {
        throw new HttpError(403, 'This payment does not belong to your account');
      }
      if (pi.status !== 'succeeded') {
        throw new HttpError(402, `Payment is not complete (status: ${pi.status})`);
      }
      const expectedCents = Math.round(nextFareEstimate * 100);
      if (pi.amount !== expectedCents) {
        throw new HttpError(400, 'Payment amount does not match the ride fare');
      }
      stripePaymentIntentId = pi.id;
    }

    const updated = await prisma.ride.update({
      where: { id: rideId },
      data: {
        paymentMethod: body.paymentMethod,
        paymentStatus: 'COMPLETED',
        stripePaymentIntentId,
        fareEstimate: nextFareEstimate,
      },
      include: {
        rider: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
    });

    emitRideUpdate(rideId, { rideId, status: updated.status, ride: updated });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/complete', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const body = completeSchema.parse(req.body);
    const { userId } = req as AuthedRequest;
    const rideId = rideIdFromParams(req);
    if (!rideId) {
      throw new HttpError(400, 'Missing ride id');
    }
    const ride = await prisma.ride.updateMany({
      where: { id: rideId, driverId: userId, status: 'STARTED' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        fareFinal: body.fareFinal ?? undefined,
      },
    });
    if (ride.count === 0) {
      throw new HttpError(404, 'Ride not found or not in STARTED state');
    }
    const full = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        rider: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
    });
    emitRideUpdate(rideId, { rideId, status: 'COMPLETED', ride: full });
    res.json(full);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const { userId, role } = req as AuthedRequest;
    const rideId = rideIdFromParams(req);
    if (!rideId) {
      throw new HttpError(400, 'Missing ride id');
    }
    const existing = await prisma.ride.findFirst({
      where: { id: rideId },
    });
    if (!existing) {
      throw new HttpError(404, 'Ride not found');
    }
    if (!['REQUESTED', 'ACCEPTED'].includes(existing.status)) {
      throw new HttpError(409, 'Ride cannot be cancelled in current state');
    }
    if (existing.status === 'REQUESTED' && role === 'DRIVER') {
      throw new HttpError(403, 'Only the rider can cancel before a driver accepts');
    }
    if (role === 'RIDER' && existing.riderId !== userId) {
      throw new HttpError(403, 'Not your ride');
    }
    if (role === 'DRIVER' && existing.driverId !== userId) {
      throw new HttpError(403, 'Not your ride');
    }
    const updated = await prisma.ride.update({
      where: { id: rideId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: {
        rider: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
      },
    });
    emitRideUpdate(rideId, { rideId, status: 'CANCELLED', ride: updated });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
