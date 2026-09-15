-- Idioma da interface, separado do idioma da IA.
ALTER TABLE "user_settings" ADD COLUMN "uiLanguage" TEXT NOT NULL DEFAULT 'pt-BR';

-- Título vazio passa a significar "sem título" (a UI traduz o placeholder).
ALTER TABLE "chat_thread" ALTER COLUMN "title" SET DEFAULT '';
UPDATE "chat_thread" SET "title" = '' WHERE "title" = 'Nova conversa';
