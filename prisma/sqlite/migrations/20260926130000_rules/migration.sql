-- AlterTable
ALTER TABLE "user_article" ADD COLUMN "isHighlighted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "scopeId" TEXT,
    "matchAll" BOOLEAN NOT NULL DEFAULT true,
    "conditions" TEXT NOT NULL,
    "actions" TEXT NOT NULL,
    "webhookEncrypted" TEXT,
    "webhookFormat" TEXT,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "rule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "rule_userId_idx" ON "rule"("userId");
