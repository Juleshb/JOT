import type { RideStatus } from '@prisma/client';

import { getIO } from '../socket.js';

const ACTIVE_STATUSES: RideStatus[] = ['REQUESTED', 'ACCEPTED', 'STARTED'];

type RideMapInput = {
  id: string;
  status: RideStatus;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress: string;
  fareEstimate: number | null;
  rider: { id: string; name: string } | null;
  driver: {
    id: string;
    name: string;
    driverProfile?: { currentLat: number | null; currentLng: number | null } | null;
  } | null;
  driverId?: string | null;
};

export function rideToMapDto(ride: RideMapInput) {
  const profile = ride.driver?.driverProfile;
  return {
    id: ride.id,
    status: ride.status,
    pickupLat: ride.pickupLat,
    pickupLng: ride.pickupLng,
    pickupAddress: ride.pickupAddress,
    dropoffLat: ride.dropoffLat,
    dropoffLng: ride.dropoffLng,
    dropoffAddress: ride.dropoffAddress,
    fareEstimate: ride.fareEstimate,
    rider: ride.rider ? { id: ride.rider.id, name: ride.rider.name } : null,
    driver: ride.driver
      ? {
          id: ride.driver.id,
          name: ride.driver.name,
          lat: profile?.currentLat ?? null,
          lng: profile?.currentLng ?? null,
        }
      : ride.driverId
        ? { id: ride.driverId, name: 'Driver', lat: null, lng: null }
        : null,
  };
}

export function emitAdminRideMap(ride: RideMapInput) {
  const io = getIO();
  if (!io) return;

  if (ACTIVE_STATUSES.includes(ride.status)) {
    io.to('admins:live').emit('admin:ride_map', {
      action: 'upsert',
      ride: rideToMapDto(ride),
    });
  } else {
    io.to('admins:live').emit('admin:ride_map', {
      action: 'remove',
      rideId: ride.id,
    });
  }
}
