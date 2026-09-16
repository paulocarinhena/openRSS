import { createHash } from "node:crypto";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiUser } from "@/lib/session";
import { articleText, errorMessage } from "@/lib/ai/content";
import { mergeAudioParts, requestSpeech, resolveTtsProvider, ttsMimeType } from "@/lib/ai/tts";

const body = z.object({
  articleId: z.string(),
  source: z.enum(["article", "summary"]).default("article"),
  text: z.string().trim().min(1).max(12000).optional(),
  force: z.boolean().optional(),
}).refine((value) => value.source !== "summary" || Boolean(value.text), { path: ["text"] });

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const article = await db.article.findFirst({
    where: { id: parsed.data.articleId, feed: { subscriptions: { some: { userId: user.id } } } },
  });
  if (!article) return new Response("Not found", { status: 404 });

  try {
    const provider = await resolveTtsProvider(user.id);
    const speechText = parsed.data.source === "summary"
      ? parsed.data.text!
          .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
          .replace(/[*_#`>]/g, "")
          .replace(/^\s*[-+]\s+/gm, "")
      : articleText(article, 28000);
    const normalizedText = speechText.trim();
    if (!normalizedText) return Response.json({ error: "A notícia não possui texto para narrar." }, { status: 400 });
    const contentHash = createHash("sha256").update(normalizedText).digest("hex");
    const cacheKey = {
      articleId: article.id,
      providerId: provider.id,
      userId: provider.userId ? user.id : "",
      model: provider.model,
      voice: provider.voice,
      format: provider.responseFormat,
      kind: parsed.data.source,
      contentHash,
    };
    if (!parsed.data.force) {
      const cached = await db.articleAudio.findUnique({
        where: { articleId_providerId_userId_model_voice_format_kind_contentHash: cacheKey },
      });
      if (cached) {
        const audio = new Blob([cached.content], { type: ttsMimeType(cached.format) });
        return new Response(audio, {
          headers: {
            "content-type": ttsMimeType(cached.format),
            "content-length": String(audio.size),
            "cache-control": "private, max-age=3600",
            "x-cached": "1",
            "x-tts-model": cached.model,
          },
        });
      }
    }
    // Envia o texto inteiro em uma única requisição, com limite de dois minutos.
    const generationSignal = AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]);
    const parts = [await requestSpeech(provider, normalizedText, generationSignal)];
    const content = mergeAudioParts(parts, provider.responseFormat);
    await db.articleAudio.upsert({
      where: { articleId_providerId_userId_model_voice_format_kind_contentHash: cacheKey },
      create: { ...cacheKey, content },
      update: { content, createdAt: new Date() },
    });
    const audio = new Blob([content], { type: ttsMimeType(provider.responseFormat) });
    return new Response(audio, {
      headers: {
        "content-type": ttsMimeType(provider.responseFormat),
        "content-length": String(audio.size),
        "cache-control": "no-store",
        "x-tts-model": provider.model,
      },
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("[ai:speech]", error instanceof Error ? error.message : String(error));
    return Response.json({ error: errorMessage(error, await getLocale()) }, { status: 502 });
  }
}
