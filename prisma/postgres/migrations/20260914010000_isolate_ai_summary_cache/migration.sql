-- Existing summaries cannot be attributed safely to a provider or credential owner.
TRUNCATE TABLE "article_summary";
DROP INDEX "article_summary_articleId_model_language_key";
ALTER TABLE "article_summary"
    ADD COLUMN "providerId" TEXT NOT NULL,
    ADD COLUMN "userId" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "article_summary_articleId_providerId_userId_model_language_key" ON "article_summary"("articleId", "providerId", "userId", "model", "language");
