import { streamText } from "ai";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiUser } from "@/lib/session";
import { getUserSettings } from "@/lib/app-settings";
import { resolveModel } from "@/lib/ai/providers";
import { articleText, errorMessage, languageInstruction } from "@/lib/ai/content";
import { accessibleArticles } from "@/lib/article-state";

const MAX_HISTORY = 10;

const body = z.object({
  articleId: z.string(),
  question: z.string().trim().min(1).max(2000),
  // Perguntas e respostas anteriores desta conversa rápida (não é persistida).
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(MAX_HISTORY * 2)
    .default([]),
});

/** Perguntas rápidas sobre o artigo aberto no leitor, respondidas a partir do texto dele. */
export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { articleId, question, history } = parsed.data;

  const article = await db.article.findFirst({ where: { id: articleId, ...accessibleArticles(user.id) } });
  if (!article) return new Response("Not found", { status: 404 });

  const settings = await getUserSettings(user.id);
  let resolved;
  try {
    resolved = await resolveModel(user.id);
  } catch (err) {
    return Response.json({ error: errorMessage(err, await getLocale()) }, { status: 400 });
  }

  const result = streamText({
    model: resolved.model,
    instructions: `Você responde perguntas de um leitor sobre o artigo abaixo, em Markdown curto e direto.
Baseie-se no artigo. Se a resposta não estiver nele, diga isso claramente antes de complementar com conhecimento geral, e deixe explícito o que não veio do artigo. Não invente citações nem números.
${languageInstruction(settings.language)}

<article>
${articleText(article, 20000)}
</article>`,
    messages: [...history.slice(-MAX_HISTORY * 2), { role: "user" as const, content: question }],
    maxOutputTokens: 1200,
    onError: ({ error }) => console.error("[ai:ask]", errorMessage(error)),
  });

  return result.toTextStreamResponse({
    headers: { "x-model": resolved.modelId, "cache-control": "no-cache, no-transform", "content-encoding": "identity", "x-accel-buffering": "no" },
  });
}
