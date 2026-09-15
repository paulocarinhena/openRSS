-- Existing summaries cannot be attributed safely to a provider or credential owner.
DROP TABLE "article_summary";

CREATE TABLE "article_summary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_summary_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "article_summary_articleId_providerId_userId_model_language_key" ON "article_summary"("articleId", "providerId", "userId", "model", "language");
