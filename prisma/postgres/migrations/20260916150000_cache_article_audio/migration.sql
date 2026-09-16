CREATE TABLE "article_audio" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_audio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "article_audio_articleId_idx" ON "article_audio"("articleId");
CREATE UNIQUE INDEX "article_audio_unique_key" ON "article_audio"("articleId", "providerId", "userId", "model", "voice", "format", "kind", "contentHash");
ALTER TABLE "article_audio" ADD CONSTRAINT "article_audio_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
