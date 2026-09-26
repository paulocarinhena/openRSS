import "server-only";
import { db } from "@/lib/db";

/** Ids numéricos dos artigos, criando os que faltarem (artigos anteriores à migration ou criados fora do ingest). */
export async function articleNums(articleIds: string[]): Promise<Map<string, number>> {
  if (articleIds.length === 0) return new Map();
  const existing = await db.articleRef.findMany({ where: { articleId: { in: articleIds } } });
  const map = new Map(existing.map((r) => [r.articleId, r.id]));
  for (const articleId of articleIds) {
    if (map.has(articleId)) continue;
    const ref = await db.articleRef.upsert({ where: { articleId }, create: { articleId }, update: {} });
    map.set(articleId, ref.id);
  }
  return map;
}

export async function articleIdsFromNums(nums: number[]): Promise<string[]> {
  const valid = nums.filter((n) => Number.isSafeInteger(n) && n > 0);
  if (valid.length === 0) return [];
  const refs = await db.articleRef.findMany({ where: { id: { in: valid } }, select: { articleId: true } });
  return refs.map((r) => r.articleId);
}

/** Ids numéricos estáveis de feeds e pastas (Fever). */
export async function refNums(kind: "feed" | "folder", ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const existing = await db.apiRef.findMany({ where: { kind, refId: { in: ids } } });
  const map = new Map(existing.map((r) => [r.refId, r.id]));
  for (const refId of ids) {
    if (map.has(refId)) continue;
    const ref = await db.apiRef.upsert({ where: { kind_refId: { kind, refId } }, create: { kind, refId }, update: {} });
    map.set(refId, ref.id);
  }
  return map;
}

export async function refIdFromNum(kind: "feed" | "folder", num: number): Promise<string | null> {
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  const ref = await db.apiRef.findFirst({ where: { id: num, kind } });
  return ref?.refId ?? null;
}

/** Garante ids numéricos para os artigos do usuário que ainda não têm (em ordem de chegada). */
export async function ensureMissingRefs(userId: string) {
  const missing = await db.article.findMany({
    where: { ref: null, OR: [{ feed: { subscriptions: { some: { userId } } } }, { states: { some: { userId, isSaved: true } } }] },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 5000,
  });
  for (const { id } of missing) {
    await db.articleRef.upsert({ where: { articleId: id }, create: { articleId: id }, update: {} });
  }
}
