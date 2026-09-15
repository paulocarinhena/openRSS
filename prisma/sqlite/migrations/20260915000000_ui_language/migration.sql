-- Idioma da interface, separado do idioma da IA.
ALTER TABLE "user_settings" ADD COLUMN "uiLanguage" TEXT NOT NULL DEFAULT 'pt-BR';

-- Título vazio passa a significar "sem título" (a UI traduz o placeholder).
-- SQLite não altera DEFAULT in-place: recria a tabela como o Prisma faz.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_chat_thread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "articleIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "chat_thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_chat_thread" ("id", "userId", "title", "articleIds", "createdAt", "updatedAt")
SELECT "id", "userId", CASE WHEN "title" = 'Nova conversa' THEN '' ELSE "title" END, "articleIds", "createdAt", "updatedAt"
FROM "chat_thread";
DROP TABLE "chat_thread";
ALTER TABLE "new_chat_thread" RENAME TO "chat_thread";
CREATE INDEX "chat_thread_userId_updatedAt_idx" ON "chat_thread"("userId", "updatedAt");
PRAGMA foreign_keys=ON;
