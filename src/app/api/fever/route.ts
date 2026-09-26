import { db } from "@/lib/db";
import { sanitizeArticleHtml } from "@/lib/feeds/sanitize";
import { userFromFeverKey, type ApiUser } from "@/lib/api/tokens";
import { articleIdsFromNums, ensureMissingRefs, refIdFromNum, refNums } from "@/lib/api/refs";
import { accessibleArticles, setArticleStates } from "@/lib/api/state";

// API Fever (https://feedafever.com/api): usada por Reeder, Unread, ReadKit, Fiery Feeds etc.
// Ids são inteiros; a autenticação é api_key = md5("email:senha de aplicativo") no corpo do POST.

export const dynamic = "force-dynamic";

const PAGE = 50;
const MAX_IDS = 20000;
const secs = (d: Date | null | undefined) => (d ? Math.floor(d.getTime() / 1000) : 0);

async function params(request: Request) {
  const url = new URL(request.url);
  const all = new URLSearchParams(url.search);
  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    const body = type.includes("multipart/form-data")
      ? new URLSearchParams([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]))
      : new URLSearchParams(await request.text());
    for (const [k, v] of body) all.set(k, v);
  }
  return all;
}

const intList = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);

async function subscriptionsOf(userId: string) {
  return db.subscription.findMany({
    where: { userId },
    select: { feedId: true, folderId: true, customTitle: true, feed: { select: { title: true, url: true, siteUrl: true, lastFetchedAt: true } } },
  });
}

async function feedsGroups(userId: string, subs: Awaited<ReturnType<typeof subscriptionsOf>>) {
  const folders = await db.folder.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: [{ position: "asc" }, { name: "asc" }] });
  const [feedNum, folderNum] = await Promise.all([refNums("feed", subs.map((s) => s.feedId)), refNums("folder", folders.map((f) => f.id))]);
  return {
    feedNum,
    groups: folders.map((f) => ({ id: folderNum.get(f.id)!, title: f.name })),
    feeds_groups: folders
      .map((f) => ({
        group_id: folderNum.get(f.id)!,
        feed_ids: subs.filter((s) => s.folderId === f.id).map((s) => feedNum.get(s.feedId)).join(","),
      }))
      .filter((g) => g.feed_ids),
  };
}

async function items(user: ApiUser, p: URLSearchParams) {
  const withIds = intList(p.get("with_ids")).slice(0, PAGE);
  const sinceId = Number(p.get("since_id"));
  const maxId = Number(p.get("max_id"));
  const where = {
    article: accessibleArticles(user.id),
    ...(withIds.length ? { id: { in: withIds } } : p.has("max_id") && maxId > 0 ? { id: { lt: maxId } } : p.has("since_id") ? { id: { gt: sinceId || 0 } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.articleRef.findMany({
      where,
      orderBy: { id: p.has("max_id") && !withIds.length ? "desc" : "asc" },
      take: PAGE,
      include: {
        article: {
          select: {
            title: true, author: true, url: true, contentHtml: true, fullContentHtml: true, publishedAt: true, feedId: true,
            states: { where: { userId: user.id }, select: { isRead: true, isSaved: true } },
          },
        },
      },
    }),
    db.articleRef.count({ where: { article: accessibleArticles(user.id) } }),
  ]);
  const feedNum = await refNums("feed", [...new Set(rows.map((r) => r.article.feedId))]);
  return {
    total_items: total,
    items: rows.map((r) => {
      const a = r.article;
      const html = a.fullContentHtml ?? a.contentHtml;
      return {
        id: r.id,
        feed_id: feedNum.get(a.feedId),
        title: a.title,
        author: a.author ?? "",
        html: html ? sanitizeArticleHtml(html, a.url) : "",
        url: a.url ?? "",
        is_saved: a.states[0]?.isSaved ? 1 : 0,
        is_read: a.states[0]?.isRead ? 1 : 0,
        created_on_time: secs(a.publishedAt),
      };
    }),
  };
}

async function idList(userId: string, where: object) {
  const rows = await db.articleRef.findMany({ where: { article: where }, select: { id: true }, orderBy: { id: "desc" }, take: MAX_IDS });
  return rows.map((r) => r.id).join(",");
}

/** mark=item|feed|group, as=read|unread|saved|unsaved, id=, before= (feed/grupo: só itens até esse instante). */
async function mark(user: ApiUser, p: URLSearchParams) {
  const kind = p.get("mark");
  const as = p.get("as");
  const id = Number(p.get("id"));
  if (kind === "item") {
    const articleIds = await articleIdsFromNums([id]);
    const change = as === "read" ? { isRead: true } : as === "unread" ? { isRead: false } : as === "saved" ? { isSaved: true } : as === "unsaved" ? { isSaved: false } : null;
    if (change) await setArticleStates(user.id, articleIds, change);
    return;
  }
  if ((kind !== "feed" && kind !== "group") || as !== "read") return;
  const before = Number(p.get("before"));
  const cutoff = before > 0 ? new Date(before * 1000) : new Date();
  const subscribed = { feed: { subscriptions: { some: { userId: user.id } } } };
  let scope: object | null = null;
  if (kind === "feed") {
    const feedId = await refIdFromNum("feed", id);
    scope = feedId ? { feedId, ...subscribed } : null;
  } else if (id === 0 || id === -1) {
    scope = subscribed; // 0 = todos os itens ("Kindling")
  } else {
    const folderId = await refIdFromNum("folder", id);
    scope = folderId ? { feed: { subscriptions: { some: { userId: user.id, folderId } } } } : null;
  }
  if (!scope) return;
  const rows = await db.article.findMany({
    where: { AND: [scope, { publishedAt: { lte: cutoff } }, { NOT: { states: { some: { userId: user.id, isRead: true } } } }] },
    select: { id: true },
  });
  await setArticleStates(user.id, rows.map((r) => r.id), { isRead: true });
}

async function handle(request: Request) {
  const p = await params(request);
  const user = await userFromFeverKey(p.get("api_key"));
  const base = { api_version: 3, auth: user ? 1 : 0 };
  if (!user) return Response.json(base);

  await ensureMissingRefs(user.id);
  if (p.has("mark")) await mark(user, p);

  const subs = await subscriptionsOf(user.id);
  const body: Record<string, unknown> = {
    ...base,
    last_refreshed_on_time: Math.max(0, ...subs.map((s) => secs(s.feed.lastFetchedAt))),
  };
  if (p.has("groups") || p.has("feeds")) {
    const { feedNum, groups, feeds_groups } = await feedsGroups(user.id, subs);
    body.feeds_groups = feeds_groups;
    if (p.has("groups")) body.groups = groups;
    if (p.has("feeds")) {
      body.feeds = subs.map((s) => ({
        id: feedNum.get(s.feedId),
        favicon_id: 0,
        title: s.customTitle ?? s.feed.title,
        url: s.feed.url,
        site_url: s.feed.siteUrl ?? "",
        is_spark: 0,
        last_updated_on_time: secs(s.feed.lastFetchedAt),
      }));
    }
  }
  if (p.has("favicons")) body.favicons = [];
  if (p.has("links")) body.links = [];
  if (p.has("items")) Object.assign(body, await items(user, p));
  if (p.has("unread_item_ids")) {
    body.unread_item_ids = await idList(user.id, {
      feed: { subscriptions: { some: { userId: user.id } } },
      NOT: { states: { some: { userId: user.id, isRead: true } } },
    });
  }
  if (p.has("saved_item_ids")) body.saved_item_ids = await idList(user.id, { states: { some: { userId: user.id, isSaved: true } } });
  return Response.json(body);
}

export const GET = handle;
export const POST = handle;
