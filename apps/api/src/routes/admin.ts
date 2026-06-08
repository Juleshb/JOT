import type { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { rideToMapDto } from '../lib/adminMapRide.js';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

const CHART_DAYS = 7;

function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

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
    const chartStart = new Date();
    chartStart.setHours(0, 0, 0, 0);
    chartStart.setDate(chartStart.getDate() - (CHART_DAYS - 1));

    const [usersByRole, ridesByStatus, driversByVerification, ridesInChartWindow, recentRides, totalRides] =
      await Promise.all([
        prisma.user.groupBy({
          by: ['role'],
          _count: { _all: true },
        }),
        prisma.ride.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        prisma.driverProfile.groupBy({
          by: ['verificationStatus'],
          _count: { _all: true },
        }),
        prisma.ride.findMany({
          where: { createdAt: { gte: chartStart } },
          select: { createdAt: true },
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

    const driverTotals = Object.fromEntries(
      driversByVerification.map((row) => [row.verificationStatus, row._count._all]),
    ) as Record<string, number>;

    const ridesPerDayMap = new Map<string, number>();
    for (const ride of ridesInChartWindow) {
      const key = ride.createdAt.toISOString().slice(0, 10);
      ridesPerDayMap.set(key, (ridesPerDayMap.get(key) ?? 0) + 1);
    }
    const ridesPerDay = lastNDayKeys(CHART_DAYS).map((date) => ({
      date,
      count: ridesPerDayMap.get(date) ?? 0,
    }));

    res.json({
      users: {
        byRole: userTotals,
        total: usersByRole.reduce((acc, r) => acc + r._count._all, 0),
      },
      rides: {
        byStatus: rideTotals,
        total: totalRides,
      },
      drivers: {
        byVerification: driverTotals,
        total: driversByVerification.reduce((acc, r) => acc + r._count._all, 0),
      },
      ridesPerDay,
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

const driverDetailSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatarUrl: true,
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
      currentLat: true,
      currentLng: true,
      averageRiderRating: true,
      riderRatingCount: true,
      updatedAt: true,
    },
  },
} as const;

type DriverActivityEvent =
  | 'ride_created'
  | 'ride_accepted'
  | 'ride_started'
  | 'ride_completed'
  | 'ride_cancelled'
  | 'rating_received';

function buildDriverActivities(
  rides: Array<{
    id: string;
    status: string;
    pickupAddress: string;
    dropoffAddress: string;
    createdAt: Date;
    acceptedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    rider: { id: string; name: string; email: string };
    rating: { stars: number; createdAt: Date } | null;
  }>,
) {
  const activities: Array<{
    id: string;
    event: DriverActivityEvent;
    at: string;
    rideId: string;
    rideStatus: string;
    riderName: string;
    pickupAddress: string;
    dropoffAddress: string;
    stars?: number;
  }> = [];

  for (const ride of rides) {
    const base = {
      rideId: ride.id,
      rideStatus: ride.status,
      riderName: ride.rider.name,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
    };

    activities.push({
      id: `${ride.id}-created`,
      event: 'ride_created',
      at: ride.createdAt.toISOString(),
      ...base,
    });

    if (ride.acceptedAt) {
      activities.push({
        id: `${ride.id}-accepted`,
        event: 'ride_accepted',
        at: ride.acceptedAt.toISOString(),
        ...base,
      });
    }
    if (ride.startedAt) {
      activities.push({
        id: `${ride.id}-started`,
        event: 'ride_started',
        at: ride.startedAt.toISOString(),
        ...base,
      });
    }
    if (ride.completedAt) {
      activities.push({
        id: `${ride.id}-completed`,
        event: 'ride_completed',
        at: ride.completedAt.toISOString(),
        ...base,
      });
    }
    if (ride.cancelledAt) {
      activities.push({
        id: `${ride.id}-cancelled`,
        event: 'ride_cancelled',
        at: ride.cancelledAt.toISOString(),
        ...base,
      });
    }
    if (ride.rating) {
      activities.push({
        id: `${ride.id}-rating`,
        event: 'rating_received',
        at: ride.rating.createdAt.toISOString(),
        stars: ride.rating.stars,
        ...base,
      });
    }
  }

  activities.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return activities;
}

const activeRideMapInclude = {
  rider: { select: { id: true, name: true } },
  driver: {
    select: {
      id: true,
      name: true,
      driverProfile: { select: { currentLat: true, currentLng: true } },
    },
  },
} as const;

router.get('/map/active-rides', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const rides = await prisma.ride.findMany({
      where: { status: { in: ['REQUESTED', 'ACCEPTED', 'STARTED'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: activeRideMapInclude,
    });

    res.json({
      rides: rides.map((r) => rideToMapDto(r)),
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/drivers/locations', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const profiles = await prisma.driverProfile.findMany({
      where: {
        isOnline: true,
        verificationStatus: 'APPROVED',
        currentLat: { not: null },
        currentLng: { not: null },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const drivers = profiles.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      phone: p.user.phone,
      avatarUrl: p.user.avatarUrl,
      lat: p.currentLat!,
      lng: p.currentLng!,
      vehicleMake: p.vehicleMake,
      vehicleModel: p.vehicleModel,
      vehicleColor: p.vehicleColor,
      licensePlate: p.licensePlate,
      averageRiderRating: p.averageRiderRating,
      riderRatingCount: p.riderRatingCount,
      updatedAt: p.updatedAt,
    }));

    res.json({ drivers, count: drivers.length, fetchedAt: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

router.get('/drivers/:userId', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const driverUserId = typeof req.params.userId === 'string' ? req.params.userId : '';
    if (!driverUserId) {
      throw new HttpError(400, 'Missing driver user id');
    }

    const driver = await prisma.user.findUnique({
      where: { id: driverUserId },
      select: driverDetailSelect,
    });

    if (!driver) {
      throw new HttpError(404, 'Driver not found');
    }
    if (!driver.driverProfile) {
      throw new HttpError(404, 'Driver profile not found');
    }
    if (driver.role !== 'DRIVER') {
      throw new HttpError(400, 'User is not a driver');
    }

    const [rides, ridesByStatus] = await Promise.all([
      prisma.ride.findMany({
        where: { driverId: driverUserId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          rider: { select: { id: true, name: true, email: true } },
          rating: { select: { stars: true, createdAt: true } },
        },
      }),
      prisma.ride.groupBy({
        by: ['status'],
        where: { driverId: driverUserId },
        _count: { _all: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      ridesByStatus.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;

    const completedRides = rides.filter((r) => r.status === 'COMPLETED');
    const totalEarnings = completedRides.reduce(
      (sum, r) => sum + (r.fareFinal ?? r.fareEstimate ?? 0),
      0,
    );

    const activities = buildDriverActivities(rides);

    res.json({
      driver,
      stats: {
        totalRides: rides.length,
        byStatus,
        completed: byStatus.COMPLETED ?? 0,
        cancelled: byStatus.CANCELLED ?? 0,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        averageRating: driver.driverProfile.averageRiderRating,
        ratingCount: driver.driverProfile.riderRatingCount,
      },
      rides,
      activities,
    });
  } catch (e) {
    next(e);
  }
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
