-- AlterTable
ALTER TABLE "article_summary" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'summary';

-- DropIndex
DROP INDEX "article_summary_articleId_providerId_userId_model_language_key";

-- CreateIndex
CREATE UNIQUE INDEX "article_summary_unique_key" ON "article_summary"("articleId", "providerId", "userId", "model", "language", "kind");
