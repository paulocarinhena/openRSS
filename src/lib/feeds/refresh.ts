import "server-only";
import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { withLock } from "@/lib/jobs/lock";
import { LocalizedError, serializeError } from "@/lib/localized-error";
import { safeFetch } from "./net";
import { parseFeed, type ParsedFeed } from "./parse";

const MAX_BACKOFF_MIN = 24 * 60;

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** `error` vem de `serializeError`: traduza com `localizeError` antes de exibir. */
type RefreshResult = { newArticleIds: string[]; error?: string };

/** Insere artigos novos (dedupe por feedId+guid) e retorna os ids criados. */
export async function ingestItems(feedId: string, items: ParsedFeed["items"]): Promise<string[]> {
  if (items.length === 0) return [];
  const unique = [...new Map(items.map((i) => [i.guid, i])).values()];
  const created: string[] = [];
  for (const item of unique) {
    try {
      const article = await db.article.create({ data: { feedId, ...item }, select: { id: true } });
      created.push(article.id);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  return created;
}

async function refreshFeedUnlocked(feedId: string): Promise<RefreshResult> {
  const feed = await db.feed.findUnique({ where: { id: feedId } });
  if (!feed) return { newArticleIds: [] };
  const { refreshIntervalMinutes } = await getAppSettings();

  try {
    const res = await safeFetch(feed.url, {
      headers: {
        ...(feed.etag ? { "if-none-match": feed.etag } : {}),
        ...(feed.lastModified ? { "if-modified-since": feed.lastModified } : {}),
      },
    });

    const next = new Date(Date.now() + refreshIntervalMinutes * 60_000);
    if (res.status === 304) {
      await db.feed.update({
        where: { id: feedId },
        data: { lastFetchedAt: new Date(), nextFetchAt: next, errorCount: 0, lastError: null },
      });
      return { newArticleIds: [] };
    }

    const parsed = await parseFeed(res.body, res.url);
    const newArticleIds = await ingestItems(feedId, parsed.items);
    await db.feed.update({
      where: { id: feedId },
      data: {
        title: parsed.title || feed.title,
        siteUrl: parsed.siteUrl ?? feed.siteUrl,
        description: parsed.description ?? feed.description,
        iconUrl: feed.iconUrl ?? parsed.iconUrl,
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        lastFetchedAt: new Date(),
        nextFetchAt: next,
        errorCount: 0,
        lastError: null,
      },
    });
    return { newArticleIds };
  } catch (err) {
    const message = serializeError(err);
    const errorCount = feed.errorCount + 1;
    const backoff = Math.min(refreshIntervalMinutes * 2 ** errorCount, MAX_BACKOFF_MIN);
    await db.feed.update({
      where: { id: feedId },
      data: {
        lastFetchedAt: new Date(),
        errorCount,
        lastError: message.slice(0, 500),
        nextFetchAt: new Date(Date.now() + backoff * 60_000),
      },
    });
    return { newArticleIds: [], error: message };
  }
}

export async function refreshFeed(feedId: string): Promise<RefreshResult> {
  const result = await withLock(`feed:${feedId}`, 2 * 60_000, () => refreshFeedUnlocked(feedId));
  return result ?? { newArticleIds: [], error: serializeError(new LocalizedError("feedRefreshing")) };
}

/** Atualiza uma lista de feeds com concorrência limitada. */
export async function refreshFeedsNow(feedIds: string[], concurrency = 4): Promise<string[]> {
  const queue = [...feedIds];
  const created: string[] = [];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const { newArticleIds } = await refreshFeed(id);
        created.push(...newArticleIds);
      }
    }),
  );
  return created;
}

/** Atualiza feeds vencidos com concorrência limitada. */
export async function refreshDueFeeds(limit = 40, concurrency = 4): Promise<string[]> {
  const due = await db.feed.findMany({
    where: { nextFetchAt: { lte: new Date() }, subscriptions: { some: {} } },
    orderBy: { nextFetchAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return refreshFeedsNow(due.map((f) => f.id), concurrency);
}

/** Assina um feed (criando-o globalmente se necessário) com os itens já baixados. */
export async function subscribe(
  userId: string,
  url: string,
  opts: { folderId?: string | null; title?: string | null; parsed?: ParsedFeed } = {},
) {
  let feed = await db.feed.findUnique({ where: { url } });
  let parsed = opts.parsed;
  if (!feed) {
    parsed =
      parsed ??
      (await (async () => {
        const res = await safeFetch(url);
        return parseFeed(res.body, res.url);
      })());
  }
  const { refreshIntervalMinutes } = await getAppSettings();
  const initial = feed;
  const subscription = await db.$transaction(async (tx) => {
    feed = await tx.feed.upsert({
      where: { url },
      create: {
        url,
        title: parsed?.title ?? initial?.title ?? url,
        siteUrl: parsed?.siteUrl ?? initial?.siteUrl,
        description: parsed?.description ?? initial?.description,
        iconUrl: parsed?.iconUrl ?? initial?.iconUrl,
        lastFetchedAt: new Date(),
        nextFetchAt: new Date(Date.now() + refreshIntervalMinutes * 60_000),
      },
      update: {},
    });
    const sub = await tx.subscription.upsert({
      where: { userId_feedId: { userId, feedId: feed.id } },
      create: { userId, feedId: feed.id, folderId: opts.folderId ?? null, customTitle: opts.title ?? null },
      update: { folderId: opts.folderId ?? undefined },
    });
    return tx.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { feed: true } });
  });
  if (parsed) await ingestItems(subscription.feedId, parsed.items);
  return subscription;
}

/**
 * Remove artigos antigos que não foram salvos por nenhum usuário e feeds sem assinantes.
 * Feeds com artigos salvos ficam: apagar o feed apagaria os salvos em cascata.
 */
export async function applyRetention() {
  const { retentionDays } = await getAppSettings();
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  const count = await db.$executeRaw`
    DELETE FROM "article"
    WHERE "publishedAt" < ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM "user_article" saved
        WHERE saved."articleId" = "article"."id" AND saved."isSaved" = true
      )
  `;
  await db.feed.deleteMany({
    where: { subscriptions: { none: {} }, articles: { none: { states: { some: { isSaved: true } } } } },
  });
  return count;
}
