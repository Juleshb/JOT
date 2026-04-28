import type { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  driverProfile: {
    select: {
      id: true,
      vehicleMake: true,
      vehicleModel: true,
      vehicleColor: true,
      licensePlate: true,
      verificationStatus: true,
      isOnline: true,
      updatedAt: true,
    },
  },
} as const;

router.get('/overview', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const [usersByRole, ridesByStatus, recentRides, totalRides] = await Promise.all([
      prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
      }),
      prisma.ride.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.ride.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          rider: { select: { id: true, name: true, email: true } },
          driver: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.ride.count(),
    ]);

    const userTotals = Object.fromEntries(
      usersByRole.map((row) => [row.role, row._count._all]),
    ) as Record<string, number>;

    const rideTotals = Object.fromEntries(
      ridesByStatus.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;

    res.json({
      users: {
        byRole: userTotals,
        total: usersByRole.reduce((acc, r) => acc + r._count._all, 0),
      },
      rides: {
        byStatus: rideTotals,
        total: totalRides,
      },
      recentRides,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/users', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const roleParam = typeof req.query.role === 'string' ? req.query.role : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const take = Math.min(Number(req.query.take) || 50, 100);

    const roleFilter: UserRole | undefined =
      roleParam === 'RIDER' || roleParam === 'DRIVER' || roleParam === 'ADMIN'
        ? roleParam
        : undefined;

    const where = {
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(q.length > 0
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const users = await prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
      take,
    });

    res.json(users);
  } catch (e) {
    next(e);
  }
});

const patchUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  role: z.enum(['RIDER', 'DRIVER', 'ADMIN']).optional(),
});

router.patch('/users/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { userId: adminId } = req as AuthedRequest;
    const targetId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!targetId) {
      throw new HttpError(400, 'Missing user id');
    }

    const body = patchUserSchema.parse(req.body);

    if (targetId === adminId && body.role != null && body.role !== 'ADMIN') {
      throw new HttpError(400, 'You cannot remove your own admin role');
    }

    if (body.role === 'DRIVER') {
      const existing = await prisma.user.findUnique({
        where: { id: targetId },
        include: { driverProfile: true },
      });
      if (!existing) {
        throw new HttpError(404, 'User not found');
      }
      if (!existing.driverProfile) {
        throw new HttpError(
          400,
          'User has no driver profile. Drivers must register with vehicle details first.',
        );
      }
    }

    const data: { name?: string; phone?: string | null; role?: 'RIDER' | 'DRIVER' | 'ADMIN' } =
      {};
    if (typeof body.name === 'string') {
      data.name = body.name.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      data.phone = body.phone?.trim() || null;
    }
    if (body.role != null) {
      data.role = body.role;
    }

    if (Object.keys(data).length === 0) {
      throw new HttpError(400, 'No valid fields to update');
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data,
      select: userSelect,
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

const verificationSchema = z.object({
  verificationStatus: z.enum(['APPROVED', 'REJECTED', 'PENDING']),
});

router.patch(
  '/drivers/:userId/verification',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res, next) => {
    try {
      const driverUserId = typeof req.params.userId === 'string' ? req.params.userId : '';
      if (!driverUserId) {
        throw new HttpError(400, 'Missing driver user id');
      }

      const body = verificationSchema.parse(req.body);

      const profile = await prisma.driverProfile.findUnique({
        where: { userId: driverUserId },
        include: { user: { select: { id: true, role: true } } },
      });

      if (!profile) {
        throw new HttpError(404, 'Driver profile not found');
      }

      if (profile.user.role !== 'DRIVER') {
        throw new HttpError(400, 'User is not a driver');
      }

      const updated = await prisma.driverProfile.update({
        where: { userId: driverUserId },
        data: { verificationStatus: body.verificationStatus },
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      });

      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/rides', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const take = Math.min(Number(req.query.take) || 50, 100);

    const statusFilter =
      statusParam === 'REQUESTED' ||
      statusParam === 'ACCEPTED' ||
      statusParam === 'STARTED' ||
      statusParam === 'COMPLETED' ||
      statusParam === 'CANCELLED'
        ? statusParam
        : undefined;

    const rides = await prisma.ride.findMany({
      where: statusFilter ? { status: statusFilter } : {},
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        rider: { select: { id: true, name: true, email: true } },
        driver: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(rides);
  } catch (e) {
    next(e);
  }
});

export default router;
