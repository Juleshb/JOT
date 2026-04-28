import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { getStripeClient } from '../lib/stripe.js';
import { broadcastRideOffer, emitRideUpdate } from '../socket.js';
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

    const driverIds = nearby.map((n) => n.userId);
    broadcastRideOffer(driverIds, {
      rideId: ride.id,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      fareEstimate: ride.fareEstimate,
      riderName: ride.rider.name,
    });

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
        driver: { select: { id: true, name: true, phone: true } },
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
        where: { id: rideId, status: 'REQUESTED', driverId: null },
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
