CREATE TABLE "tts_provider" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "apiKeyEncrypted" TEXT,
    "model" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "responseFormat" TEXT NOT NULL DEFAULT 'mp3',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tts_provider_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tts_provider_userId_idx" ON "tts_provider"("userId");
ALTER TABLE "tts_provider" ADD CONSTRAINT "tts_provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_settings" ADD COLUMN "ttsProviderId" TEXT;
