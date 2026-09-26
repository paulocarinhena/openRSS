import { convertToModelMessages, isStepCount, streamText, tool, type UIMessage } from "ai";
import { randomUUID } from "node:crypto";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, icontains } from "@/lib/db";
import { getApiUser } from "@/lib/session";
import { getUserSettings } from "@/lib/app-settings";
import { resolveModel } from "@/lib/ai/providers";
import { articleText, errorMessage, languageInstruction } from "@/lib/ai/content";
import { parseJsonArray, truncate } from "@/lib/utils";
import { acquireLock } from "@/lib/jobs/lock";
import { semanticSearch } from "@/lib/ai/embeddings";

export const maxDuration = 120;

const body = z.object({
  threadId: z.string(),
  messages: z.array(z.custom<UIMessage>((m) => typeof m === "object" && m !== null && "role" in m)),
  // Escolhas do compositor (opcionais): provedor, modelo e nível de raciocínio.
  providerId: z.string().optional(),
  model: z.string().max(200).optional(),
  reasoning: z.enum(["low", "medium", "high", "xhigh"]).optional(),
});

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { threadId, messages, providerId, model, reasoning } = parsed.data;

  const thread = await db.chatThread.findFirst({ where: { id: threadId, userId: user.id } });
  if (!thread) return new Response("Not found", { status: 404 });

  const settings = await getUserSettings(user.id);
  const locale = await getLocale();
  let resolved;
  try {
    resolved = await resolveModel(user.id, { providerId, model });
  } catch (err) {
    return Response.json({ error: errorMessage(err, locale) }, { status: 400 });
  }

  const subscribed = { feed: { subscriptions: { some: { userId: user.id } } } };
  const contextArticles = await db.article.findMany({
    where: { id: { in: parseJsonArray(thread.articleIds) }, ...subscribed },
    take: 5,
  });

  const tools = {
    searchArticles: tool({
      description: "Busca artigos nos feeds do usuário por palavra-chave (título e resumo). Use para perguntas sobre notícias ou temas.",
      inputSchema: z.object({
        query: z.string().describe("Palavra-chave curta"),
        days: z.number().int().min(1).max(90).optional().describe("Limitar aos últimos N dias"),
      }),
      execute: async ({ query, days }) => {
        const scope = { ...subscribed, ...(days ? { publishedAt: { gte: new Date(Date.now() - days * 86400000) } } : {}) };
        const select = { id: true, title: true, snippet: true, publishedAt: true, url: true, feed: { select: { title: true } } } as const;
        const byWord = await db.article.findMany({
          where: { ...scope, OR: [{ title: icontains(query) }, { snippet: icontains(query) }] },
          select,
          orderBy: { publishedAt: "desc" },
          take: 15,
        });
        // Com a busca semântica ligada, completa com artigos parecidos por assunto.
        const similar = (await semanticSearch(query, scope, 15).catch(() => null)) ?? [];
        const missing = similar.map((m) => m.id).filter((id) => !byWord.some((r) => r.id === id));
        const extra = missing.length ? await db.article.findMany({ where: { id: { in: missing } }, select }) : [];
        const rows = [...byWord, ...missing.flatMap((id) => extra.filter((r) => r.id === id))].slice(0, 20);
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          feed: r.feed.title,
          publishedAt: r.publishedAt.toISOString(),
          snippet: truncate(r.snippet ?? "", 240),
          link: `/article/${r.id}`,
        }));
      },
    }),
    readArticle: tool({
      description: "Lê o conteúdo completo de um artigo pelo id.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const a = await db.article.findFirst({ where: { id, ...subscribed } });
        return a ? articleText(a, 12000) : "Artigo não encontrado.";
      },
    }),
  };

  const context = contextArticles.length
    ? `\n\nArtigos em contexto nesta conversa:\n${contextArticles.map((a) => `<article id="${a.id}">\n${articleText(a, 10000)}\n</article>`).join("\n")}`
    : "";

  const releaseThread = await acquireLock(`chat:${threadId}`, 3 * 60_000);
  if (!releaseThread) {
    const t = await getTranslations("chat.errors");
    return new Response(t("busy"), { status: 409 });
  }

  let result;
  try {
    result = streamText({
      model: resolved.model,
      instructions: `Você é o assistente de leitura do openRSS. Responda em Markdown, de forma direta.
Use as ferramentas para buscar e ler artigos dos feeds do usuário quando a pergunta exigir. Cite artigos como links [título](/article/ID). Não invente fatos que não estejam nos artigos; diga quando não encontrar.
Data atual: ${new Date().toISOString().slice(0, 10)}.
${languageInstruction(settings.language)}${context}`,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: isStepCount(6),
      ...(reasoning ? { reasoning } : {}),
      onError: ({ error }) => {
        void releaseThread();
        console.error("[ai:chat]", errorMessage(error));
      },
      onAbort: () => {
        void releaseThread();
        console.warn(`[ai:chat] requisição abortada pelo cliente (thread ${threadId})`);
      },
    });
  } catch (error) {
    await releaseThread();
    throw error;
  }

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: (error) => errorMessage(error, locale),
    onEnd: async ({ messages: all }) => {
      try {
        const firstUserText = all
          .find((m) => m.role === "user")
          ?.parts.find((p): p is { type: "text"; text: string } => p.type === "text")?.text;
        const endedAt = Date.now();
        await db.$transaction([
          ...all.map((m, i) => {
            const id = m.id || randomUUID();
            return db.chatMessage.upsert({
              // Incluir threadId impede que um id fornecido pelo cliente altere outra conversa.
              where: { id, threadId },
              create: { id, threadId, role: m.role, parts: JSON.stringify(m.parts), createdAt: new Date(endedAt + i) },
              update: { role: m.role, parts: JSON.stringify(m.parts) },
            });
          }),
          db.chatThread.update({
            where: { id: threadId },
            data: {
              updatedAt: new Date(),
              ...(!thread.title && firstUserText ? { title: truncate(firstUserText, 80) } : {}),
            },
          }),
        ]);
      } finally {
        await releaseThread();
      }
    },
  });
}
