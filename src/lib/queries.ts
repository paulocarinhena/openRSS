import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getLocale } from "next-intl/server";
import { db, icontains } from "@/lib/db";
import { localizeError } from "@/lib/localized-error";
import { getUserSettings } from "@/lib/app-settings";
import { sanitizeArticleHtml } from "@/lib/feeds/sanitize";
import { stripHtml, truncate } from "@/lib/utils";

export type ArticleScope =
  | { kind: "today" }
  | { kind: "all" }
  | { kind: "saved" }
  | { kind: "feed"; feedId: string }
  | { kind: "folder"; folderId: string };

export const PAGE_SIZE = 40;

export async function getSidebarData(userId: string) {
  const [locale, folders, subscriptions, savedCount] = await Promise.all([
    getLocale(),
    db.folder.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db.subscription.findMany({
      where: { userId },
      include: { feed: { select: { id: true, title: true, iconUrl: true, siteUrl: true, url: true, errorCount: true, lastError: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.userArticle.count({ where: { userId, isSaved: true } }),
  ]);

  const counts = subscriptions.length
    ? await db.article.groupBy({
        by: ["feedId"],
        where: {
          feedId: { in: subscriptions.map((s) => s.feedId) },
          NOT: { states: { some: { userId, isRead: true } } },
        },
        _count: { _all: true },
      })
    : [];
  const unreadByFeed = new Map(counts.map((c) => [c.feedId, c._count._all]));

  const subs = subscriptions
    .map((s) => ({
      id: s.id,
      feedId: s.feedId,
      folderId: s.folderId,
      title: s.customTitle ?? s.feed.title,
      iconUrl: s.feed.iconUrl,
      siteUrl: s.feed.siteUrl,
      url: s.feed.url,
      hasError: s.feed.errorCount >= 3,
      lastError: s.feed.lastError ? localizeError(s.feed.lastError, locale) : null,
      unread: unreadByFeed.get(s.feedId) ?? 0,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    folders: folders.map((f) => {
      const items = subs.filter((s) => s.folderId === f.id);
      return { id: f.id, name: f.name, subscriptions: items, unread: items.reduce((n, s) => n + s.unread, 0) };
    }),
    unfiled: subs.filter((s) => !s.folderId || !folders.some((f) => f.id === s.folderId)),
    totalUnread: subs.reduce((n, s) => n + s.unread, 0),
    savedCount,
  };
}

export type SidebarData = Awaited<ReturnType<typeof getSidebarData>>;

function dayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function firstInstantOfDay(day: string, timeZone: string) {
  const utcMidnight = Date.parse(`${day}T00:00:00.000Z`);
  let low = utcMidnight - 36 * 3600_000;
  let high = utcMidnight + 36 * 3600_000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (dayKey(new Date(mid), timeZone) < day) low = mid + 1;
    else high = mid;
  }
  return new Date(low);
}

export function dayRangeInTimezone(date: Date, timeZone: string) {
  const day = dayKey(date, timeZone);
  const [year, month, dateOfMonth] = day.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, dateOfMonth + 1)).toISOString().slice(0, 10);
  return { start: firstInstantOfDay(day, timeZone), end: firstInstantOfDay(nextDay, timeZone) };
}

export async function articleScopeWhere(userId: string, scope: ArticleScope): Promise<Prisma.ArticleWhereInput> {
  const subscribed: Prisma.ArticleWhereInput = { feed: { subscriptions: { some: { userId } } } };
  switch (scope.kind) {
    case "saved":
      return { states: { some: { userId, isSaved: true } } };
    case "feed":
      return { feedId: scope.feedId, ...subscribed };
    case "folder":
      return { feed: { subscriptions: { some: { userId, folderId: scope.folderId } } } };
    case "today": {
      const settings = await getUserSettings(userId);
      const { start, end } = dayRangeInTimezone(new Date(), settings.timezone);
      return { ...subscribed, publishedAt: { gte: start, lt: end } };
    }
    default:
      return subscribed;
  }
}

const articleSelect = (userId: string) =>
  ({
    id: true,
    title: true,
    url: true,
    author: true,
    snippet: true,
    contentHtml: true,
    imageUrl: true,
    publishedAt: true,
    feed: { select: { id: true, title: true, iconUrl: true } },
    states: { where: { userId }, select: { isRead: true, isSaved: true, isHighlighted: true, priorityScore: true, priorityReason: true } },
  }) satisfies Prisma.ArticleSelect;

export async function listArticles(
  userId: string,
  scope: ArticleScope,
  opts: { unreadOnly?: boolean; page?: number; query?: string } = {},
) {
  const unreadOnly = opts.unreadOnly ?? scope.kind !== "saved";
  const where: Prisma.ArticleWhereInput = {
    AND: [
      await articleScopeWhere(userId, scope),
      unreadOnly ? { NOT: { states: { some: { userId, isRead: true } } } } : {},
      opts.query ? { OR: [{ title: icontains(opts.query) }, { snippet: icontains(opts.query) }] } : {},
    ],
  };
  const page = Math.max(0, opts.page ?? 0);

  if (scope.kind === "today") {
    // Ordena por prioridade da IA (quando houver) e depois por data.
    const rows = await db.article.findMany({ where, select: articleSelect(userId), orderBy: { publishedAt: "desc" } });
    const sorted = rows
      .map(toListItem)
      .sort((a, b) => (b.priorityScore ?? -1) - (a.priorityScore ?? -1) || +b.publishedAt - +a.publishedAt);
    return { items: sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), hasMore: sorted.length > (page + 1) * PAGE_SIZE };
  }

  const rows = await db.article.findMany({
    where,
    select: articleSelect(userId),
    orderBy: { publishedAt: "desc" },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  return { items: rows.slice(0, PAGE_SIZE).map(toListItem), hasMore: rows.length > PAGE_SIZE };
}

function toListItem(a: Prisma.ArticleGetPayload<{ select: ReturnType<typeof articleSelect> }>) {
  const s = a.states[0];
  return {
    id: a.id,
    title: a.title,
    url: a.url,
    author: a.author,
    snippet: a.snippet,
    /** Trecho maior do texto para os cards (o HTML completo não vai para o cliente). */
    excerpt: truncate(stripHtml(a.contentHtml ?? a.snippet ?? ""), 700) || null,
    /** "" no banco = já verificado e sem imagem. */
    imageUrl: a.imageUrl || null,
    imageChecked: a.imageUrl !== null,
    publishedAt: a.publishedAt,
    feed: a.feed,
    isRead: s?.isRead ?? false,
    isSaved: s?.isSaved ?? false,
    isHighlighted: s?.isHighlighted ?? false,
    priorityScore: s?.priorityScore ?? null,
    priorityReason: s?.priorityReason ?? null,
  };
}

export type ArticleListItem = ReturnType<typeof toListItem>;

export async function getArticle(userId: string, articleId: string) {
  const article = await db.article.findFirst({
    where: {
      id: articleId,
      OR: [{ feed: { subscriptions: { some: { userId } } } }, { states: { some: { userId, isSaved: true } } }],
    },
    include: {
      feed: { select: { id: true, title: true, iconUrl: true, siteUrl: true } },
      states: { where: { userId } },
    },
  });
  if (!article) return null;
  const { states, ...rest } = article;
  return {
    ...rest,
    // Reaplica o saneamento: artigos extraídos/ingeridos antes de uma correção no sanitizador
    // (ex.: forçar target="_blank" nos links) ficam com o HTML cru gravado no banco.
    contentHtml: rest.contentHtml ? sanitizeArticleHtml(rest.contentHtml, rest.url) : rest.contentHtml,
    fullContentHtml: rest.fullContentHtml ? sanitizeArticleHtml(rest.fullContentHtml, rest.url) : rest.fullContentHtml,
    state: states.at(0) ?? null,
  };
}

export type ArticleDetail = NonNullable<Awaited<ReturnType<typeof getArticle>>>;

/** Título do escopo; os fixos vêm traduzidos em `labels` (articles.scopes.*). */
export async function scopeTitle(
  userId: string,
  scope: ArticleScope,
  labels: { today: string; all: string; saved: string },
): Promise<string | null> {
  switch (scope.kind) {
    case "today":
      return labels.today;
    case "all":
      return labels.all;
    case "saved":
      return labels.saved;
    case "feed": {
      const sub = await db.subscription.findFirst({ where: { userId, feedId: scope.feedId }, include: { feed: true } });
      return sub ? (sub.customTitle ?? sub.feed.title) : null;
    }
    case "folder": {
      const folder = await db.folder.findFirst({ where: { id: scope.folderId, userId } });
      return folder?.name ?? null;
    }
  }
}
