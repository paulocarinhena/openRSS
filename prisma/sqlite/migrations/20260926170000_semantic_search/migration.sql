-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN "embeddingModel" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "embeddingProviderId" TEXT;

-- CreateTable
CREATE TABLE "article_embedding" (
    "articleId" TEXT NOT NULL PRIMARY KEY,
    "modelKey" TEXT NOT NULL,
    "vector" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_embedding_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "article_embedding_modelKey_idx" ON "article_embedding"("modelKey");
