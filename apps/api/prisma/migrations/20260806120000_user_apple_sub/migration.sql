-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_appleSub_key" ON "User"("appleSub");
