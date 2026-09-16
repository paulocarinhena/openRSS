-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_article_summary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'summary',
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_summary_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_article_summary" ("articleId", "content", "createdAt", "id", "language", "model", "providerId", "userId") SELECT "articleId", "content", "createdAt", "id", "language", "model", "providerId", "userId" FROM "article_summary";
DROP TABLE "article_summary";
ALTER TABLE "new_article_summary" RENAME TO "article_summary";
CREATE UNIQUE INDEX "article_summary_articleId_providerId_userId_model_language_kind_key" ON "article_summary"("articleId", "providerId", "userId", "model", "language", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
