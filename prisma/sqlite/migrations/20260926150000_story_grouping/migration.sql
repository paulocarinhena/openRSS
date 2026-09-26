-- AlterTable
ALTER TABLE "article" ADD COLUMN "storyId" TEXT;

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "groupStories" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "article_storyId_idx" ON "article"("storyId");
