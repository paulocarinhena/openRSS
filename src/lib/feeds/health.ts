import "server-only";
import { db } from "@/lib/db";

const DAY = 86400000;
/** Sem artigo novo há mais que isso: o feed provavelmente parou. */
export const STALE_DAYS = 60;
/** Janela das métricas de volume e leitura. */
export const WINDOW_DAYS = 30;
/** Publica muito e quase nada é lido: candidato a cancelar. */
const LOW_READ_MIN_ARTICLES = 10;
const LOW_READ_RATIO = 0.1;
/** Mais de 10 artigos por dia em média. */
const NOISY_PER_WINDOW = 300;
/** Falhas seguidas a partir das quais o feed é marcado com erro (mesmo critério da barra lateral). */
const ERROR_THRESHOLD = 3;

export type FeedStatus = "error" | "stale" | "lowRead" | "noisy" | "ok";

export type FeedHealth = {
  subscriptionId: string;
  feedId: string;
  title: string;
  url: string;
  status: FeedStatus[];
  errorCount: number;
  lastError: string | null;
  lastFetchedAt: Date | null;
  nextFetchAt: Date;
  lastArticleAt: Date | null;
  articles30d: number;
  read30d: number;
  unread: number;
};

/** Métricas por feed do usuário para o painel de saúde. */
export async function getFeedHealth(userId: string, now = new Date()): Promise<FeedHealth[]> {
  const subs = await db.subscription.findMany({
    where: { userId },
    select: {
      id: true,
      feedId: true,
      customTitle: true,
      feed: { select: { title: true, url: true, errorCount: true, lastError: true, lastFetchedAt: true, nextFetchAt: true } },
    },
  });
  if (subs.length === 0) return [];
  const feedIds = subs.map((s) => s.feedId);
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const [latest, recent, readRecent, unread] = await Promise.all([
    db.article.groupBy({ by: ["feedId"], where: { feedId: { in: feedIds } }, _max: { publishedAt: true } }),
    db.article.groupBy({ by: ["feedId"], where: { feedId: { in: feedIds }, publishedAt: { gte: since } }, _count: { _all: true } }),
    db.article.groupBy({
      by: ["feedId"],
      where: { feedId: { in: feedIds }, publishedAt: { gte: since }, states: { some: { userId, isRead: true } } },
      _count: { _all: true },
    }),
    db.article.groupBy({
      by: ["feedId"],
      where: { feedId: { in: feedIds }, NOT: { states: { some: { userId, isRead: true } } } },
      _count: { _all: true },
    }),
  ]);
  const lastOf = new Map(latest.map((g) => [g.feedId, g._max.publishedAt]));
  const countOf = (rows: { feedId: string; _count: { _all: number } }[]) => new Map(rows.map((g) => [g.feedId, g._count._all]));
  const recentOf = countOf(recent);
  const readOf = countOf(readRecent);
  const unreadOf = countOf(unread);

  return subs
    .map((s): FeedHealth => {
      const lastArticleAt = lastOf.get(s.feedId) ?? null;
      const articles30d = recentOf.get(s.feedId) ?? 0;
      const read30d = readOf.get(s.feedId) ?? 0;
      const status: FeedStatus[] = [];
      if (s.feed.errorCount >= ERROR_THRESHOLD) status.push("error");
      if (!lastArticleAt || now.getTime() - lastArticleAt.getTime() > STALE_DAYS * DAY) status.push("stale");
      if (articles30d >= LOW_READ_MIN_ARTICLES && read30d / articles30d < LOW_READ_RATIO) status.push("lowRead");
      if (articles30d > NOISY_PER_WINDOW) status.push("noisy");
      return {
        subscriptionId: s.id,
        feedId: s.feedId,
        title: s.customTitle ?? s.feed.title,
        url: s.feed.url,
        status: status.length ? status : ["ok"],
        errorCount: s.feed.errorCount,
        lastError: s.feed.lastError,
        lastFetchedAt: s.feed.lastFetchedAt,
        nextFetchAt: s.feed.nextFetchAt,
        lastArticleAt,
        articles30d,
        read30d,
        unread: unreadOf.get(s.feedId) ?? 0,
      };
    })
    .sort((a, b) => severity(a) - severity(b) || a.title.localeCompare(b.title));
}

const ORDER: FeedStatus[] = ["error", "stale", "lowRead", "noisy", "ok"];
const severity = (f: FeedHealth) => Math.min(...f.status.map((s) => ORDER.indexOf(s)));
