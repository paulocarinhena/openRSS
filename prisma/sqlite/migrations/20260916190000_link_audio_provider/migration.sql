CREATE TABLE "new_article_audio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_audio_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "article_audio_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "tts_provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_article_audio" ("id", "articleId", "providerId", "userId", "model", "voice", "format", "kind", "contentHash", "content", "createdAt")
SELECT audio."id", audio."articleId", audio."providerId", audio."userId", audio."model", audio."voice", audio."format", audio."kind", audio."contentHash", audio."content", audio."createdAt"
FROM "article_audio" audio
INNER JOIN "article" article ON article."id" = audio."articleId"
INNER JOIN "tts_provider" provider ON provider."id" = audio."providerId";

DROP TABLE "article_audio";
ALTER TABLE "new_article_audio" RENAME TO "article_audio";
CREATE INDEX "article_audio_articleId_idx" ON "article_audio"("articleId");
CREATE UNIQUE INDEX "article_audio_unique_key" ON "article_audio"("articleId", "providerId", "userId", "model", "voice", "format", "kind", "contentHash");
