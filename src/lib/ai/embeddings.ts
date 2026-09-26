import "server-only";
import { embed, embedMany, type EmbeddingModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiProvider, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAppSettings } from "@/lib/app-settings";
import { createPinnedWebFetch } from "@/lib/network";
import { stripHtml, truncate } from "@/lib/utils";
import { PROVIDER_META, type ProviderType } from "./providers";

// Busca semântica: cada artigo vira um vetor (título + trecho) calculado por um provedor
// global escolhido pelo admin. A busca compara o vetor da pergunta com os dos artigos em
// memória (instâncias pequenas: dezenas de milhares de vetores cabem com folga).

/** Provedores com API de embeddings no formato da OpenAI. A Anthropic não oferece embeddings. */
export const EMBEDDING_PROVIDER_TYPES: ProviderType[] = ["openai", "openai_compatible", "openrouter"];

const BATCH = 64;
const INDEX_PER_RUN = 256;
/** Só indexa o que tem chance de ser buscado; artigos antigos saem pela retenção. */
const INDEX_WINDOW_DAYS = 60;
const MAX_CANDIDATES = 20000;
const MIN_SCORE = 0.2;

export type EmbeddingConfig = { model: EmbeddingModel; key: string; provider: AiProvider; modelId: string };

export function createEmbeddingModel(provider: AiProvider, modelId: string): EmbeddingModel {
  const apiKey = provider.apiKeyEncrypted ? decrypt(provider.apiKeyEncrypted) : undefined;
  const fetch = createPinnedWebFetch(provider.type === "openai_compatible" && provider.userId === null);
  if (provider.type === "openai") return createOpenAI({ apiKey, baseURL: provider.baseUrl || undefined, fetch }).embeddingModel(modelId);
  if (provider.type === "openai_compatible" || provider.type === "openrouter") {
    const baseURL = provider.baseUrl || PROVIDER_META[provider.type as ProviderType].defaultBaseUrl;
    return createOpenAICompatible({ name: "embeddings", baseURL, apiKey, fetch }).embeddingModel(modelId);
  }
  throw new Error(`O provedor ${provider.type} não oferece embeddings.`);
}

/** Configuração ativa (admin) ou null quando a busca semântica está desligada. */
export async function getEmbeddingConfig(): Promise<EmbeddingConfig | null> {
  const { embeddingProviderId, embeddingModel } = await getAppSettings();
  if (!embeddingProviderId || !embeddingModel) return null;
  const provider = await db.aiProvider.findFirst({ where: { id: embeddingProviderId, userId: null, enabled: true } });
  if (!provider || !EMBEDDING_PROVIDER_TYPES.includes(provider.type as ProviderType)) return null;
  return { model: createEmbeddingModel(provider, embeddingModel), key: `${provider.id}:${embeddingModel}`, provider, modelId: embeddingModel };
}

/** Normaliza (norma 1): a similaridade de cosseno vira um produto escalar. */
export function toVector(values: number[]): Float32Array {
  const v = Float32Array.from(values);
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export const vectorToBytes = (v: Float32Array): Uint8Array<ArrayBuffer> => new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer);
export const bytesToVector = (b: Uint8Array) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

export function dot(a: Float32Array, b: Float32Array) {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Texto indexado: título e o começo do conteúdo. */
export const embeddingText = (a: { title: string; snippet: string | null; contentHtml?: string | null }) =>
  truncate(`${a.title}\n${a.snippet ?? stripHtml(a.contentHtml ?? "")}`, 1500);

/** Calcula e grava os vetores dos artigos indicados que ainda não têm vetor do modelo atual. */
export async function embedArticles(articleIds: string[], config?: EmbeddingConfig | null) {
  const active = config === undefined ? await getEmbeddingConfig() : config;
  if (!active || articleIds.length === 0) return 0;
  const articles = await db.article.findMany({
    where: { id: { in: articleIds }, NOT: { embedding: { modelKey: active.key } } },
    select: { id: true, title: true, snippet: true, contentHtml: true },
  });
  let done = 0;
  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    const { embeddings } = await embedMany({ model: active.model, values: batch.map(embeddingText), maxRetries: 1 });
    await db.$transaction(
      batch.map((a, j) => {
        const vector = vectorToBytes(toVector(embeddings[j]));
        return db.articleEmbedding.upsert({
          where: { articleId: a.id },
          create: { articleId: a.id, modelKey: active.key, vector },
          update: { modelKey: active.key, vector, createdAt: new Date() },
        });
      }),
    );
    done += batch.length;
  }
  return done;
}

/** Indexa aos poucos o que falta (artigos recentes primeiro). Chamado pelo agendador. */
export async function embedPending(limit = INDEX_PER_RUN) {
  const config = await getEmbeddingConfig();
  if (!config) return 0;
  const pending = await db.article.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - INDEX_WINDOW_DAYS * 86400000) },
      NOT: { embedding: { modelKey: config.key } },
    },
    select: { id: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return embedArticles(pending.map((a) => a.id), config);
}

/**
 * Artigos do escopo mais parecidos com a consulta, do mais para o menos parecido.
 * Retorna null quando a busca semântica está desligada.
 */
export async function semanticSearch(query: string, where: Prisma.ArticleWhereInput, limit = 40): Promise<{ id: string; score: number }[] | null> {
  const config = await getEmbeddingConfig();
  if (!config || !query.trim()) return null;
  const { embedding } = await embed({ model: config.model, value: query.trim().slice(0, 1000), maxRetries: 1 });
  const target = toVector(embedding);
  const rows = await db.articleEmbedding.findMany({
    where: { modelKey: config.key, article: where },
    select: { articleId: true, vector: true },
    orderBy: { article: { publishedAt: "desc" } },
    take: MAX_CANDIDATES,
  });
  return rows
    .map((r) => ({ id: r.articleId, score: dot(target, bytesToVector(r.vector)) }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Quantos artigos recentes já têm vetor do modelo atual (para o painel do admin). */
export async function embeddingStatus() {
  const config = await getEmbeddingConfig();
  if (!config) return null;
  const since = new Date(Date.now() - INDEX_WINDOW_DAYS * 86400000);
  const [indexed, total] = await Promise.all([
    db.articleEmbedding.count({ where: { modelKey: config.key, article: { publishedAt: { gte: since } } } }),
    db.article.count({ where: { publishedAt: { gte: since } } }),
  ]);
  return { indexed, total };
}
