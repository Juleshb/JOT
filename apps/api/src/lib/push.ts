import { prisma } from './prisma.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

function isExpoPushToken(token: string): boolean {
  return (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[')
  );
}

async function postExpoPush(messages: Array<Record<string, unknown>>): Promise<void> {
  if (messages.length === 0) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[push] Expo HTTP ${res.status}: ${text.slice(0, 200)}`);
      return;
    }
    const json = (await res.json()) as { data?: ExpoPushTicket[] };
    const tickets = Array.isArray(json.data) ? json.data : [];
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        console.warn('[push] ticket error:', ticket.message, ticket.details);
        const err = ticket.details?.error;
        if (err === 'DeviceNotRegistered' && typeof ticket.message === 'string') {
          // Token cleanup happens via clearInvalidTokens when we know which token failed.
        }
      }
    }
  } catch (e) {
    console.warn('[push] send failed:', e instanceof Error ? e.message : e);
  }
}

async function tokensForUsers(userIds: string[]): Promise<Array<{ userId: string; token: string }>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: unique },
      expoPushToken: { not: null },
    },
    select: { id: true, expoPushToken: true },
  });
  return users
    .filter((u): u is { id: string; expoPushToken: string } => Boolean(u.expoPushToken))
    .filter((u) => isExpoPushToken(u.expoPushToken))
    .map((u) => ({ userId: u.id, token: u.expoPushToken }));
}

/** Clear tokens Expo reports as unregistered. */
export async function clearPushToken(token: string): Promise<void> {
  await prisma.user.updateMany({
    where: { expoPushToken: token },
    data: { expoPushToken: null, pushPlatform: null, pushTokenUpdatedAt: null },
  });
}

/** Send the same notification to one or more users (by id). Fire-and-forget safe. */
export async function sendPushToUsers(userIds: string[], message: PushMessage): Promise<void> {
  const targets = await tokensForUsers(userIds);
  if (targets.length === 0) return;

  const messages = targets.map(({ token }) => ({
    to: token,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: message.sound === null ? undefined : (message.sound ?? 'default'),
    channelId: message.channelId ?? 'rides',
    priority: 'high',
  }));

  await postExpoPush(messages);
}

export function pushNewRideOffer(opts: {
  driverIds: string[];
  rideId: string;
  pickupAddress: string;
  riderName?: string;
}): void {
  const pickup = opts.pickupAddress?.trim() || 'a nearby pickup';
  void sendPushToUsers(opts.driverIds, {
    title: 'New ride request',
    body: opts.riderName
      ? `${opts.riderName} needs a ride from ${pickup}`
      : `New ride from ${pickup}`,
    data: { type: 'ride.offer', rideId: opts.rideId },
  });
}

export function pushRideLocationUpdated(opts: {
  driverIds: string[];
  rideId: string;
  pickupAddress: string;
}): void {
  const pickup = opts.pickupAddress?.trim() || 'pickup';
  void sendPushToUsers(opts.driverIds, {
    title: 'Ride location updated',
    body: `Pickup/dropoff changed — now from ${pickup}`,
    data: { type: 'ride.offer_updated', rideId: opts.rideId },
  });
}

export function pushRideAccepted(opts: {
  riderId: string;
  rideId: string;
  driverName?: string;
}): void {
  void sendPushToUsers([opts.riderId], {
    title: 'Driver on the way',
    body: opts.driverName
      ? `${opts.driverName} accepted your ride and is heading to pickup`
      : 'A driver accepted your ride and is heading to pickup',
    data: { type: 'ride.accepted', rideId: opts.rideId },
  });
}

export function pushRideStarted(opts: { riderId: string; rideId: string }): void {
  void sendPushToUsers([opts.riderId], {
    title: 'Trip started',
    body: 'Your JO Transportation trip is underway. Sit back and enjoy the ride.',
    data: { type: 'ride.started', rideId: opts.rideId },
  });
}

export function pushRideCompleted(opts: { riderId: string; rideId: string }): void {
  void sendPushToUsers([opts.riderId], {
    title: 'Trip complete',
    body: 'Thanks for riding with JO Transportation. You can rate your driver in the app.',
    data: { type: 'ride.completed', rideId: opts.rideId },
  });
}

export function pushRideRated(opts: {
  driverId: string;
  rideId: string;
  stars: number;
  riderName?: string;
}): void {
  const who = opts.riderName?.trim() || 'A rider';
  const stars = '★'.repeat(opts.stars) + '☆'.repeat(Math.max(0, 5 - opts.stars));
  void sendPushToUsers([opts.driverId], {
    title: 'New trip review',
    body: `${who} rated you ${opts.stars}/5 ${stars}`,
    data: { type: 'ride.rated', rideId: opts.rideId, stars: opts.stars },
  });
}

export function pushRideCancelled(opts: {
  userIds: string[];
  rideId: string;
  cancelledBy: 'rider' | 'driver' | 'system';
}): void {
  const body =
    opts.cancelledBy === 'rider'
      ? 'The rider cancelled this trip.'
      : opts.cancelledBy === 'driver'
        ? 'The driver cancelled this trip.'
        : 'This trip was cancelled.';
  void sendPushToUsers(opts.userIds, {
    title: 'Ride cancelled',
    body,
    data: { type: 'ride.cancelled', rideId: opts.rideId },
  });
}
