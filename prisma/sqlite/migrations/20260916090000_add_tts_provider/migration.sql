CREATE TABLE "tts_provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "apiKeyEncrypted" TEXT,
    "model" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "responseFormat" TEXT NOT NULL DEFAULT 'mp3',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tts_provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tts_provider_userId_idx" ON "tts_provider"("userId");
ALTER TABLE "user_settings" ADD COLUMN "ttsProviderId" TEXT;
