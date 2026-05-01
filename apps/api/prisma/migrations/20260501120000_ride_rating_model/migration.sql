-- CreateTable
CREATE TABLE "RideRating" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RideRating_rideId_key" ON "RideRating"("rideId");

-- AddForeignKey
ALTER TABLE "RideRating" ADD CONSTRAINT "RideRating_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy Ride columns if they exist (older dev DBs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Ride' AND column_name = 'riderRatingStars'
  ) THEN
    INSERT INTO "RideRating" ("id", "rideId", "stars", "createdAt")
    SELECT
      'cm_legacy_' || substr(md5(r.id || 'rating'), 1, 18),
      r.id,
      r."riderRatingStars",
      COALESCE(r."riderRatedAt", CURRENT_TIMESTAMP)
    FROM "Ride" r
    WHERE r."riderRatingStars" IS NOT NULL
    ON CONFLICT ("rideId") DO NOTHING;
  END IF;
END $$;

ALTER TABLE "Ride" DROP COLUMN IF EXISTS "riderRatingStars";
ALTER TABLE "Ride" DROP COLUMN IF EXISTS "riderRatedAt";
