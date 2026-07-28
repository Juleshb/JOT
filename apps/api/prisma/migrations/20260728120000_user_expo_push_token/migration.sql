-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "expoPushToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushPlatform" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushTokenUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_expoPushToken_idx" ON "User"("expoPushToken");
