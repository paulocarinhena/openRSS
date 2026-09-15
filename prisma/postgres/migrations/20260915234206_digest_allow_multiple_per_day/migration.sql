-- DropIndex
DROP INDEX "digest_userId_day_key";

-- CreateIndex
CREATE INDEX "digest_userId_day_idx" ON "digest"("userId", "day");

-- CreateIndex
CREATE INDEX "digest_userId_createdAt_idx" ON "digest"("userId", "createdAt");
