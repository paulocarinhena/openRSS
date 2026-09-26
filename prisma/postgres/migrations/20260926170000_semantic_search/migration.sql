-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "embeddingModel" TEXT,
ADD COLUMN     "embeddingProviderId" TEXT;

-- CreateTable
CREATE TABLE "article_embedding" (
    "articleId" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "vector" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_embedding_pkey" PRIMARY KEY ("articleId")
);

-- CreateIndex
CREATE INDEX "article_embedding_modelKey_idx" ON "article_embedding"("modelKey");

-- AddForeignKey
ALTER TABLE "article_embedding" ADD CONSTRAINT "article_embedding_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
