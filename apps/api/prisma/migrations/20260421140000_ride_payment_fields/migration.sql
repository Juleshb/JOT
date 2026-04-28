-- CreateEnum
CREATE TYPE "RidePaymentMethod" AS ENUM ('CASH', 'CARD');

-- CreateEnum
CREATE TYPE "RidePaymentStatus" AS ENUM ('PENDING', 'COMPLETED');

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN "paymentMethod" "RidePaymentMethod",
ADD COLUMN "paymentStatus" "RidePaymentStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill existing rows as cash-style completed bookings
UPDATE "Ride" SET "paymentMethod" = 'CASH', "paymentStatus" = 'COMPLETED' WHERE "paymentMethod" IS NULL;

ALTER TABLE "Ride" ALTER COLUMN "paymentMethod" SET NOT NULL;
