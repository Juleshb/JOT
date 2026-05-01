import type { Server as HttpServer } from 'node:http';

import type { UserRole } from '@prisma/client';
import { Server } from 'socket.io';

import { verifyToken } from './lib/jwt.js';
import { prisma } from './lib/prisma.js';

let io: Server | null = null;

export function getIO(): Server | null {
  return io;
}

type SocketAuth = {
  userId: string;
  role: UserRole;
};

export function initSocket(httpServer: HttpServer, corsOrigin: string) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin === '*' ? true : corsOrigin.split(','), credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.query.token === 'string' ? socket.handshake.query.token : undefined);
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      const { sub, role } = verifyToken(token);
      (socket.data as SocketAuth).userId = sub;
      (socket.data as SocketAuth).role = role;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data as SocketAuth;
    console.log(`[socket] connected id=${socket.id} user=${userId} role=${role}`);
    void socket.join(`user:${userId}`);
    if (role === 'DRIVER') {
      void socket.join('drivers:online');
    }

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected id=${socket.id} user=${userId} reason=${reason}`);
    });

    socket.on('driver:location', async (payload: { lat: number; lng: number }) => {
      if (role !== 'DRIVER') {
        return;
      }
      const lat = Number(payload?.lat);
      const lng = Number(payload?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      await prisma.driverProfile.updateMany({
        where: { userId },
        data: { currentLat: lat, currentLng: lng, isOnline: true },
      });

      const activeRides = await prisma.ride.findMany({
        where: {
          driverId: userId,
          status: { in: ['ACCEPTED', 'STARTED'] },
        },
        select: { id: true, riderId: true },
      });
      for (const ride of activeRides) {
        const out = { rideId: ride.id, lat, lng };
        emitToUser(ride.riderId, 'driver:location', out);
        io?.to(`ride:${ride.id}`).emit('driver:location', out);
      }
    });

    socket.on('ride:subscribe', async (payload: { rideId: string }) => {
      const rideId = payload?.rideId;
      if (!rideId || typeof rideId !== 'string') {
        return;
      }
      const ride = await prisma.ride.findFirst({
        where: {
          id: rideId,
          OR: [{ riderId: userId }, { driverId: userId }],
        },
        // Minimal select so subscribe auth does not depend on every Ride column
        // (avoids stale client / DB mismatch if a column was removed from the table).
        select: { id: true },
      });
      if (ride) {
        void socket.join(`ride:${rideId}`);
      }
    });

    socket.on('disconnect', () => {
      /* noop */
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitRideUpdate(rideId: string, payload: unknown) {
  io?.to(`ride:${rideId}`).emit('ride:status', payload);
}

export function broadcastRideOffer(driverUserIds: string[], payload: unknown) {
  for (const id of driverUserIds) {
    io?.to(`user:${id}`).emit('ride:offer', payload);
  }
}

/** Notify all online drivers that a pending ride’s pickup/dropoff was updated (same shape as ride:offer). */
export function broadcastRideOfferUpdate(payload: unknown) {
  io?.to('drivers:online').emit('ride:offer_update', payload);
}
