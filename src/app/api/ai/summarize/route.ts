import { streamText } from "ai";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiUser } from "@/lib/session";
import { getUserSettings } from "@/lib/app-settings";
import { resolveModel } from "@/lib/ai/providers";
import { articleText, errorMessage, languageName } from "@/lib/ai/content";

const body = z.object({ articleId: z.string(), force: z.boolean().optional() });

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { articleId, force } = parsed.data;

  const article = await db.article.findFirst({
    where: { id: articleId, feed: { subscriptions: { some: { userId: user.id } } } },
  });
  if (!article) return new Response("Not found", { status: 404 });

  const settings = await getUserSettings(user.id);
  let resolved;
  try {
    resolved = await resolveModel(user.id);
  } catch (err) {
    return Response.json({ error: errorMessage(err, await getLocale()) }, { status: 400 });
  }

  const cacheKey = {
    articleId,
    providerId: resolved.provider.id,
    userId: resolved.provider.userId ? user.id : "",
    model: resolved.modelId,
    language: settings.language,
  };
  if (!force) {
    const cached = await db.articleSummary.findUnique({ where: { articleId_providerId_userId_model_language: cacheKey } });
    if (cached) {
      return new Response(cached.content, {
        headers: { "content-type": "text/plain; charset=utf-8", "x-cached": "1", "x-model": cached.model },
      });
    }
  }

  const result = streamText({
    model: resolved.model,
    instructions: `Você resume artigos para um leitor de RSS. Responda em ${languageName(settings.language)}, em Markdown.
Formato: uma frase TL;DR em negrito, depois 3 a 6 tópicos curtos com os pontos principais. Se houver números, datas ou nomes relevantes, mantenha-os. Não invente nada que não esteja no texto.`,
    prompt: articleText(article),
    maxOutputTokens: 800,
    onFinish: async ({ text }) => {
      if (!text.trim()) return;
      await db.articleSummary.upsert({
        where: { articleId_providerId_userId_model_language: cacheKey },
        create: { ...cacheKey, content: text },
        update: { content: text, createdAt: new Date() },
      });
    },
    onError: ({ error }) => console.error("[ai:summarize]", errorMessage(error)),
  });

  return result.toTextStreamResponse({ headers: { "x-model": resolved.modelId } });
}
