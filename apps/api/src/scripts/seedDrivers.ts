import 'dotenv/config';

import bcrypt from 'bcryptjs';

import { prisma } from '../lib/prisma.js';

type SeedDriver = {
  email: string;
  name: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  licensePlate: string;
  lat: number;
  lng: number;
};

const SAMPLE_PASSWORD = 'Driver@1234';

const RUBAVU_DRIVERS: SeedDriver[] = [
  {
    email: 'rubavu.driver1@jotransport.rw',
    name: 'Eric Rubavu',
    phone: '+250788110101',
    vehicleMake: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleColor: 'Silver',
    licensePlate: 'RAB 101A',
    lat: -1.6804,
    lng: 29.2603,
  },
  {
    email: 'rubavu.driver2@jotransport.rw',
    name: 'Jean Claude Rubavu',
    phone: '+250788110102',
    vehicleMake: 'Hyundai',
    vehicleModel: 'Elantra',
    vehicleColor: 'White',
    licensePlate: 'RAB 102A',
    lat: -1.6768,
    lng: 29.2559,
  },
];

/** Dallas–Fort Worth area — for local dev when testing on a US device/simulator. */
const DALLAS_DRIVERS: SeedDriver[] = [
  {
    email: 'dallas.driver1@jotransport.rw',
    name: 'Marcus DFW',
    phone: '+12145550101',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    vehicleColor: 'Gray',
    licensePlate: 'DFW 101',
    lat: 32.7767,
    lng: -96.797,
  },
  {
    email: 'dallas.driver2@jotransport.rw',
    name: 'Sofia DFW',
    phone: '+12145550102',
    vehicleMake: 'Honda',
    vehicleModel: 'Accord',
    vehicleColor: 'White',
    licensePlate: 'DFW 102',
    lat: 32.8998,
    lng: -97.0403,
  },
];

const MUSANZE_DRIVERS: SeedDriver[] = [
  {
    email: 'musanze.driver1@jotransport.rw',
    name: 'Patrick Musanze',
    phone: '+250788220201',
    vehicleMake: 'Volkswagen',
    vehicleModel: 'Polo',
    vehicleColor: 'Blue',
    licensePlate: 'RAC 201M',
    lat: -1.5001,
    lng: 29.6346,
  },
  {
    email: 'musanze.driver2@jotransport.rw',
    name: 'Yves Musanze',
    phone: '+250788220202',
    vehicleMake: 'Nissan',
    vehicleModel: 'Sentra',
    vehicleColor: 'Black',
    licensePlate: 'RAC 202M',
    lat: -1.4959,
    lng: 29.6278,
  },
];

async function upsertDriver(driver: SeedDriver, passwordHash: string) {
  const user = await prisma.user.upsert({
    where: { email: driver.email },
    update: {
      passwordHash,
      name: driver.name,
      phone: driver.phone,
      role: 'DRIVER',
    },
    create: {
      email: driver.email,
      passwordHash,
      name: driver.name,
      phone: driver.phone,
      role: 'DRIVER',
    },
  });

  await prisma.driverProfile.upsert({
    where: { userId: user.id },
    update: {
      vehicleMake: driver.vehicleMake,
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      licensePlate: driver.licensePlate,
      verificationStatus: 'APPROVED',
      isOnline: true,
      currentLat: driver.lat,
      currentLng: driver.lng,
    },
    create: {
      userId: user.id,
      vehicleMake: driver.vehicleMake,
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      licensePlate: driver.licensePlate,
      verificationStatus: 'APPROVED',
      isOnline: true,
      currentLat: driver.lat,
      currentLng: driver.lng,
    },
  });
}

async function main() {
  const drivers = [...RUBAVU_DRIVERS, ...MUSANZE_DRIVERS, ...DALLAS_DRIVERS];
  const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 12);

  for (const driver of drivers) {
    await upsertDriver(driver, passwordHash);
  }

  console.log(`Seeded ${drivers.length} online drivers (Rubavu, Musanze, Dallas).`);
  console.log(`Password for all seed drivers: ${SAMPLE_PASSWORD}`);
  console.log('Examples:');
  console.log('  dallas.driver1@jotransport.rw  (DFW — use for US testing)');
  console.log('  rubavu.driver1@jotransport.rw  (Rwanda)');
  console.log('Mobile dev: set EXPO_PUBLIC_DRIVER_USE_PROFILE_LOCATION=true to keep seed GPS on map.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
