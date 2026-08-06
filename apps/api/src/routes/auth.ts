import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { signInWithApple } from '../lib/appleAuthSession.js';
import { HttpError } from '../lib/httpError.js';
import { signToken } from '../lib/jwt.js';
import {
  exchangeGoogleAuthCode,
  publicUser,
  signInWithGooglePayload,
  verifyGoogleIdToken,
} from '../lib/googleSignIn.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['RIDER', 'DRIVER']),
  vehicle: z
    .object({
      make: z.string(),
      model: z.string(),
      color: z.string(),
      licensePlate: z.string(),
    })
    .optional(),
});

router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    if (body.role === 'DRIVER' && !body.vehicle) {
      throw new HttpError(400, 'Drivers must provide vehicle details');
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, 'Email already registered');
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: body.name,
          phone: body.phone,
          role: body.role,
        },
      });
      if (body.role === 'DRIVER' && body.vehicle) {
        await tx.driverProfile.create({
          data: {
            userId: u.id,
            vehicleMake: body.vehicle.make,
            vehicleModel: body.vehicle.model,
            vehicleColor: body.vehicle.color,
            licensePlate: body.vehicle.licensePlate,
            verificationStatus: 'APPROVED',
          },
        });
      }
      return u;
    });
    const token = signToken({ sub: user.id, role: user.role });
    res.status(201).json({
      token,
      user: publicUser(user),
    });
  } catch (e) {
    next(e);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new HttpError(401, 'Invalid credentials');
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, 'Invalid credentials');
    }
    const token = signToken({ sub: user.id, role: user.role });
    res.json({
      token,
      user: publicUser(user),
    });
  } catch (e) {
    next(e);
  }
});

const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = googleLoginSchema.parse(req.body);
    const payload = await verifyGoogleIdToken(idToken);
    const session = await signInWithGooglePayload(payload);
    res.json(session);
  } catch (e) {
    next(e);
  }
});

const googleCodeSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
});

/** Mobile / Expo Go: exchange OAuth authorization code for a session (requires GOOGLE_CLIENT_SECRET). */
router.post('/google/code', async (req, res, next) => {
  try {
    const { code, redirectUri } = googleCodeSchema.parse(req.body);
    const idToken = await exchangeGoogleAuthCode(code, redirectUri);
    const payload = await verifyGoogleIdToken(idToken);
    const session = await signInWithGooglePayload(payload);
    res.json(session);
  } catch (e) {
    next(e);
  }
});

const appleLoginSchema = z.object({
  identityToken: z.string().min(1),
  email: z.string().email().optional().nullable(),
  fullName: z.string().max(120).optional().nullable(),
});

/** Sign in with Apple (required when Google login is offered — App Store 4.8). */
router.post('/apple', async (req, res, next) => {
  try {
    const body = appleLoginSchema.parse(req.body);
    const session = await signInWithApple({
      identityToken: body.identityToken,
      email: body.email,
      fullName: body.fullName,
    });
    res.json(session);
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true },
    });
    if (!user) {
      throw new HttpError(404, 'User not found');
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      driverProfile: user.driverProfile,
    });
  } catch (e) {
    next(e);
  }
});

const updateMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const body = updateMeSchema.parse(req.body);

    const data: { name?: string; phone?: string | null } = {};
    if (typeof body.name === 'string') {
      data.name = body.name.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      data.phone = body.phone?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      throw new HttpError(400, 'No valid fields to update');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      include: { driverProfile: true },
    });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      driverProfile: user.driverProfile,
    });
  } catch (e) {
    next(e);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

router.post('/me/password', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const body = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) {
      throw new HttpError(400, 'Current password is incorrect');
    }

    if (body.currentPassword === body.newPassword) {
      throw new HttpError(400, 'New password must be different from the current password');
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Permanently delete the authenticated account and related rider data (App Store 5.1.1).
 * Active trips are cancelled first; driver rides they were assigned are detached via cascade rules.
 */
router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true },
    });
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.ride.updateMany({
        where: {
          OR: [
            { riderId: userId, status: { in: ['REQUESTED', 'ACCEPTED', 'STARTED'] } },
            { driverId: userId, status: { in: ['REQUESTED', 'ACCEPTED', 'STARTED'] } },
          ],
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      if (user.driverProfile) {
        await tx.driverProfile.update({
          where: { userId },
          data: { isOnline: false, currentLat: null, currentLng: null },
        });
      }

      await tx.user.delete({ where: { id: userId } });
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
