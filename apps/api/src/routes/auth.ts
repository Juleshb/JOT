import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { signToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

const router = Router();
const googleClient = new OAuth2Client();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

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
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: null },
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
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: null },
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
    if (!GOOGLE_CLIENT_ID) {
      throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured');
    }

    const { idToken } = googleLoginSchema.parse(req.body);
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || payload.email_verified !== true) {
      throw new HttpError(401, 'Google account email is not verified');
    }

    const email = payload.email.trim().toLowerCase();
    const displayName = payload.name?.trim() || email.split('@')[0];
    const avatarUrl = payload.picture ?? null;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Store a random hash for compatibility with existing schema.
      const passwordHash = await bcrypt.hash(randomUUID(), 12);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: displayName,
          role: 'RIDER',
        },
      });
    }

    const token = signToken({ sub: user.id, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl,
      },
    });
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
      avatarUrl: null,
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
      avatarUrl: null,
      driverProfile: user.driverProfile,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
