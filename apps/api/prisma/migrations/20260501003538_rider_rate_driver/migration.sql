-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "averageRiderRating" DOUBLE PRECISION,
ADD COLUMN     "riderRatingCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "riderRatedAt" TIMESTAMP(3),
ADD COLUMN     "riderRatingStars" INTEGER;
