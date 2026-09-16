DELETE FROM "article_audio" audio
WHERE NOT EXISTS (SELECT 1 FROM "tts_provider" provider WHERE provider."id" = audio."providerId");

ALTER TABLE "article_audio"
ADD CONSTRAINT "article_audio_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "tts_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
