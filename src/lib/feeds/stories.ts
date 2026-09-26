import "server-only";
import { db } from "@/lib/db";

// Agrupa artigos de feeds diferentes que falam do mesmo fato, comparando as palavras
// relevantes dos títulos. Não depende de IA: funciona em qualquer instalação.

/** Janela em que duas notícias podem ser o mesmo fato. */
const WINDOW_MS = 48 * 3600_000;
const MAX_CANDIDATES = 4000;
/** Pelo menos 3 palavras em comum e 60% das palavras do título menor. */
const MIN_SHARED = 3;
const MIN_OVERLAP = 0.6;

const STOPWORDS = new Set(
  (
    // pt
    "a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra com sem sob sobre entre ate apos " +
    "e ou mas que se como quando onde porque pois ja nao sim mais menos muito muita muitos muitas pouco ser esta este estes estas " +
    "isso isto essa esse esses essas aquele aquela seu sua seus suas ele ela eles elas voce voces nos eu tem ter foi sao era vai vao " +
    "diz dizem apos contra ao aos numa num pelo novo nova novos novas veja saiba entenda " +
    // en
    "the a an of to in on at by for with from about into over after before and or but not no is are was were be been being has have " +
    "had do does did will would can could should may might this that these those it its he she they them his her their you your we our " +
    "new says said how why what when where who which than then there here up out more most just also " +
    // es
    "el la los las un una unos unas del al en con sin por para sobre entre tras desde hasta y o pero que como cuando donde porque ya " +
    "no si mas menos muy es son fue era ser esta este estos estas eso esto su sus lo le les se nuevo nueva dice"
  ).split(/\s+/),
);

/** Palavras relevantes do título: sem acento, sem caixa, sem stopwords e com plural simples removido. */
export function titleTokens(title: string): Set<string> {
  const words = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u);
  const tokens = new Set<string>();
  for (const word of words) {
    if (!word || STOPWORDS.has(word)) continue;
    if (/^\p{N}+$/u.test(word) ? word.length < 2 : word.length < 3) continue;
    tokens.add(word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word);
  }
  return tokens;
}

/** Coeficiente de sobreposição; 0 quando não há palavras suficientes em comum. */
export function storySimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size < MIN_SHARED || b.size < MIN_SHARED) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared < MIN_SHARED) return 0;
  const overlap = shared / Math.min(a.size, b.size);
  return overlap >= MIN_OVERLAP ? overlap : 0;
}

type Candidate = { id: string; feedId: string; storyId: string | null; publishedAt: Date; tokens: Set<string> };

/**
 * Liga cada artigo novo ao artigo mais parecido de OUTRO feed publicado perto dele.
 * O primeiro artigo de um grupo empresta o próprio id como storyId.
 */
export async function assignStories(articleIds: string[]) {
  if (articleIds.length === 0) return 0;
  const fresh = await db.article.findMany({
    where: { id: { in: articleIds }, storyId: null },
    select: { id: true, feedId: true, title: true, publishedAt: true },
    orderBy: { publishedAt: "asc" },
  });
  if (fresh.length === 0) return 0;
  const times = fresh.map((a) => a.publishedAt.getTime());
  const pool = await db.article.findMany({
    where: {
      id: { notIn: fresh.map((a) => a.id) },
      publishedAt: { gte: new Date(Math.min(...times) - WINDOW_MS), lte: new Date(Math.max(...times) + WINDOW_MS) },
    },
    select: { id: true, feedId: true, title: true, storyId: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
    take: MAX_CANDIDATES,
  });
  const candidates: Candidate[] = pool.map((a) => ({ ...a, tokens: titleTokens(a.title) }));

  let grouped = 0;
  for (const article of fresh) {
    const tokens = titleTokens(article.title);
    let best: { candidate: Candidate; score: number } | null = null;
    for (const c of candidates) {
      if (c.feedId === article.feedId || Math.abs(c.publishedAt.getTime() - article.publishedAt.getTime()) > WINDOW_MS) continue;
      const score = storySimilarity(tokens, c.tokens);
      if (score > 0 && (!best || score > best.score)) best = { candidate: c, score };
    }
    if (best) {
      const storyId = best.candidate.storyId ?? best.candidate.id;
      if (!best.candidate.storyId) {
        await db.article.update({ where: { id: best.candidate.id }, data: { storyId } });
        best.candidate.storyId = storyId;
      }
      await db.article.update({ where: { id: article.id }, data: { storyId } });
      grouped++;
    }
    // Os próximos artigos novos também podem se juntar a este.
    candidates.push({ ...article, storyId: best ? (best.candidate.storyId ?? null) : null, tokens });
  }
  return grouped;
}

/** Agrupa o que chegou nos últimos dias (instalações anteriores ao recurso). */
export async function groupRecentStories(days = 3) {
  const recent = await db.article.findMany({
    where: { storyId: null, publishedAt: { gte: new Date(Date.now() - days * 86400000) } },
    select: { id: true },
    orderBy: { publishedAt: "asc" },
    take: MAX_CANDIDATES,
  });
  return assignStories(recent.map((a) => a.id));
}
