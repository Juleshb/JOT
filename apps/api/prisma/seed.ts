import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertAdmin() {
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME?.trim() || 'Admin';

  if (!email || !password) {
    console.info(
      'Skipping admin seed: set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD to create or promote an admin user.',
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === 'ADMIN') {
      console.info(`User ${email} is already an admin.`);
      return;
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN' },
    });
    console.info(`Promoted existing user ${email} to ADMIN (password unchanged).`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: 'ADMIN',
    },
  });
  console.info(`Created admin user ${email}.`);
}

/** App Review demo rider — document these credentials in App Store Connect notes. */
async function upsertDemoRider() {
  const email = (
    process.env.DEMO_RIDER_EMAIL?.trim() || 'reviewer@jotransportation.online'
  ).toLowerCase();
  const password = process.env.DEMO_RIDER_PASSWORD?.trim() || 'ReviewDemo2026!';
  const name = process.env.DEMO_RIDER_NAME?.trim() || 'App Review Rider';

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        name,
        role: 'RIDER',
      },
    });
    console.info(`Updated App Review demo rider ${email}.`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: 'RIDER',
      phone: '+12145550100',
    },
  });
  console.info(`Created App Review demo rider ${email}.`);
}

async function main() {
  await upsertAdmin();
  await upsertDemoRider();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
