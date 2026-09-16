-- RedefineIndex
DROP INDEX "article_summary_articleId_providerId_userId_model_language_kind_key";
CREATE UNIQUE INDEX "article_summary_unique_key" ON "article_summary"("articleId", "providerId", "userId", "model", "language", "kind");
