import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { sanitizeArticleHtml } from "@/lib/feeds/sanitize";
import { discoverFeeds } from "@/lib/feeds/discover";
import { subscribe } from "@/lib/feeds/refresh";
import { localizeError } from "@/lib/localized-error";
import { userFromAppPassword, type ApiUser } from "./tokens";
import { articleIdsFromNums, articleNums, ensureMissingRefs } from "./refs";
import { accessibleArticles, setArticleStates } from "@/lib/article-state";

// Implementação do protocolo "Google Reader" como descrito por FreshRSS/Inoreader/The Old Reader.
// Base URL para os clientes: https://<host>/api/greader

const STATE = "user/-/state/com.google/";
const READING_LIST = `${STATE}reading-list`;
const READ = `${STATE}read`;
const STARRED = `${STATE}starred`;
const KEPT_UNREAD = `${STATE}kept-unread`;
const LABEL = "user/-/label/";
const MAX_ITEMS = 1000;

const text = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
const json = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store" } });
const unauthorized = () => text("Error=BadAuthentication", 401);

/** "user/1234/state/…" e "user/-/state/…" são equivalentes. */
const normalizeStream = (s: string) => s.replace(/^user\/[^/]+\//, "user/-/");

export const longItemId = (num: number) => `tag:google.com,2005:reader/item/${num.toString(16).padStart(16, "0")}`;

/** Aceita o id longo, o hexadecimal de 16 dígitos e o decimal curto. */
export function parseItemId(raw: string): number | null {
  const value = raw.trim();
  const long = /^tag:google\.com,2005:reader\/item\/([0-9a-f]+)$/i.exec(value);
  const n = long ? parseInt(long[1], 16) : /^[0-9a-f]{16}$/i.test(value) ? parseInt(value, 16) : /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function readParams(request: Request) {
  const params = new URLSearchParams(new URL(request.url).search);
  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    const body = type.includes("multipart/form-data")
      ? [...(await request.formData()).entries()].map(([k, v]) => [k, String(v)] as [string, string])
      : [...new URLSearchParams(await request.text())];
    for (const [k, v] of body) params.append(k, v);
  }
  return params;
}

async function authenticate(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = /^GoogleLogin\s+auth=(.+)$/i.exec(header)?.[1]?.trim();
  return userFromAppPassword(token);
}

/** Filtro de artigos de um stream do usuário. `null` = stream desconhecido. */
async function streamWhere(userId: string, rawStream: string): Promise<Prisma.ArticleWhereInput | null> {
  const stream = normalizeStream(rawStream);
  const subscribed: Prisma.ArticleWhereInput = { feed: { subscriptions: { some: { userId } } } };
  if (stream === READING_LIST) return subscribed;
  if (stream === STARRED) return { states: { some: { userId, isSaved: true } } };
  if (stream === READ) return { ...subscribed, states: { some: { userId, isRead: true } } };
  if (stream.startsWith(LABEL)) {
    const folder = await db.folder.findFirst({ where: { userId, name: stream.slice(LABEL.length) } });
    return folder ? { feed: { subscriptions: { some: { userId, folderId: folder.id } } } } : null;
  }
  if (stream.startsWith("feed/")) {
    const ref = stream.slice("feed/".length);
    const feed = await db.feed.findFirst({ where: { OR: [{ id: ref }, { url: ref }], subscriptions: { some: { userId } } }, select: { id: true } });
    return feed ? { feedId: feed.id } : null;
  }
  return null;
}

/** Aplica os filtros comuns de stream: xt/it (estado), ot/nt (tempo, em segundos). */
async function queryStream(user: ApiUser, p: URLSearchParams, stream: string) {
  const where = await streamWhere(user.id, stream);
  if (!where) return null;
  const and: Prisma.ArticleWhereInput[] = [where];
  for (const xt of p.getAll("xt").map(normalizeStream)) {
    if (xt === READ) and.push({ NOT: { states: { some: { userId: user.id, isRead: true } } } });
    if (xt === STARRED) and.push({ NOT: { states: { some: { userId: user.id, isSaved: true } } } });
  }
  for (const it of p.getAll("it").map(normalizeStream)) {
    if (it === READ) and.push({ states: { some: { userId: user.id, isRead: true } } });
    if (it === STARRED) and.push({ states: { some: { userId: user.id, isSaved: true } } });
  }
  const ot = Number(p.get("ot"));
  const nt = Number(p.get("nt"));
  if (ot > 0) and.push({ publishedAt: { gte: new Date(ot * 1000) } });
  if (nt > 0) and.push({ publishedAt: { lte: new Date(nt * 1000) } });

  const n = Math.min(MAX_ITEMS, Math.max(1, Number(p.get("n")) || 20));
  const offset = Math.max(0, Number(p.get("c")) || 0);
  const direction = p.get("r") === "o" ? "asc" : "desc";
  const rows = await db.article.findMany({
    where: { AND: and },
    orderBy: [{ publishedAt: direction }, { id: direction }],
    skip: offset,
    take: n + 1,
    select: { id: true, publishedAt: true },
  });
  return { rows: rows.slice(0, n), continuation: rows.length > n ? String(offset + n) : undefined };
}

async function itemsJson(user: ApiUser, articleIds: string[]) {
  if (articleIds.length === 0) return [];
  const [articles, nums, folders] = await Promise.all([
    db.article.findMany({
      where: { id: { in: articleIds }, ...accessibleArticles(user.id) },
      include: {
        feed: { select: { id: true, title: true, siteUrl: true, subscriptions: { where: { userId: user.id }, select: { folderId: true, customTitle: true } } } },
        states: { where: { userId: user.id } },
      },
    }),
    articleNums(articleIds),
    db.folder.findMany({ where: { userId: user.id }, select: { id: true, name: true } }),
  ]);
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const byId = new Map(articles.map((a) => [a.id, a]));
  // Mantém a ordem pedida (a do stream).
  return articleIds.flatMap((id) => {
    const a = byId.get(id);
    if (!a) return [];
    const state = a.states[0];
    const sub = a.feed.subscriptions[0];
    const folder = sub?.folderId ? folderName.get(sub.folderId) : undefined;
    const html = a.fullContentHtml ?? a.contentHtml ?? a.snippet ?? "";
    const published = Math.floor(a.publishedAt.getTime() / 1000);
    return [
      {
        id: longItemId(nums.get(a.id)!),
        crawlTimeMsec: String(a.createdAt.getTime()),
        timestampUsec: String(a.publishedAt.getTime() * 1000),
        published,
        updated: published,
        title: a.title,
        author: a.author ?? "",
        canonical: a.url ? [{ href: a.url }] : [],
        alternate: a.url ? [{ href: a.url, type: "text/html" }] : [],
        summary: { direction: "ltr", content: html ? sanitizeArticleHtml(html, a.url) : "" },
        categories: [
          READING_LIST,
          ...(folder ? [`${LABEL}${folder}`] : []),
          ...(state?.isRead ? [READ] : []),
          ...(state?.isSaved ? [STARRED] : []),
        ],
        origin: { streamId: `feed/${a.feed.id}`, title: sub?.customTitle ?? a.feed.title, htmlUrl: a.feed.siteUrl ?? "" },
      },
    ];
  });
}

async function subscriptionList(user: ApiUser) {
  const subs = await db.subscription.findMany({
    where: { userId: user.id },
    include: { feed: { select: { id: true, title: true, url: true, siteUrl: true, iconUrl: true } }, folder: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return json({
    subscriptions: subs.map((s) => ({
      id: `feed/${s.feed.id}`,
      title: s.customTitle ?? s.feed.title,
      categories: s.folder ? [{ id: `${LABEL}${s.folder.name}`, label: s.folder.name, type: "folder" }] : [],
      url: s.feed.url,
      htmlUrl: s.feed.siteUrl ?? "",
      iconUrl: s.feed.iconUrl ?? "",
    })),
  });
}

async function unreadCount(user: ApiUser) {
  const subs = await db.subscription.findMany({ where: { userId: user.id }, select: { feedId: true, folder: { select: { name: true } } } });
  const unread = { NOT: { states: { some: { userId: user.id, isRead: true } } } };
  const groups = subs.length
    ? await db.article.groupBy({
        by: ["feedId"],
        where: { feedId: { in: subs.map((s) => s.feedId) }, ...unread },
        _count: { _all: true },
        _max: { publishedAt: true },
      })
    : [];
  const usec = (d: Date | null | undefined) => String((d?.getTime() ?? 0) * 1000);
  const perFeed = new Map(groups.map((g) => [g.feedId, g]));
  const counts: { id: string; count: number; newestItemTimestampUsec: string }[] = [];
  const labels = new Map<string, { count: number; newest: number }>();
  let total = 0;
  let newest = 0;
  for (const s of subs) {
    const g = perFeed.get(s.feedId);
    if (!g) continue;
    const time = g._max.publishedAt?.getTime() ?? 0;
    counts.push({ id: `feed/${s.feedId}`, count: g._count._all, newestItemTimestampUsec: usec(g._max.publishedAt) });
    total += g._count._all;
    newest = Math.max(newest, time);
    if (s.folder) {
      const l = labels.get(s.folder.name) ?? { count: 0, newest: 0 };
      labels.set(s.folder.name, { count: l.count + g._count._all, newest: Math.max(l.newest, time) });
    }
  }
  for (const [name, l] of labels) counts.push({ id: `${LABEL}${name}`, count: l.count, newestItemTimestampUsec: String(l.newest * 1000) });
  counts.push({ id: READING_LIST, count: total, newestItemTimestampUsec: String(newest * 1000) });
  return json({ max: total, unreadcounts: counts });
}

async function editTag(user: ApiUser, p: URLSearchParams) {
  const nums = p.getAll("i").map(parseItemId).filter((n): n is number => n !== null);
  const articleIds = await articleIdsFromNums(nums);
  const add = p.getAll("a").map(normalizeStream);
  const remove = p.getAll("r").map(normalizeStream);
  const change: { isRead?: boolean; isSaved?: boolean } = {};
  if (add.includes(READ)) change.isRead = true;
  if (remove.includes(READ) || add.includes(KEPT_UNREAD)) change.isRead = false;
  if (add.includes(STARRED)) change.isSaved = true;
  if (remove.includes(STARRED)) change.isSaved = false;
  await setArticleStates(user.id, articleIds, change);
  return text("OK");
}

async function markAllAsRead(user: ApiUser, p: URLSearchParams) {
  const where = await streamWhere(user.id, p.get("s") ?? READING_LIST);
  if (!where) return text("Not found", 404);
  const ts = Number(p.get("ts"));
  const cutoff = ts > 0 ? new Date(Math.floor(ts / 1000)) : new Date();
  const rows = await db.article.findMany({
    where: { AND: [where, { publishedAt: { lte: cutoff } }, { NOT: { states: { some: { userId: user.id, isRead: true } } } }] },
    select: { id: true },
  });
  await setArticleStates(user.id, rows.map((r) => r.id), { isRead: true });
  return text("OK");
}

async function folderByLabel(userId: string, label: string | null, create = false) {
  const stream = label ? normalizeStream(label) : "";
  if (!stream.startsWith(LABEL)) return null;
  const name = stream.slice(LABEL.length).trim().slice(0, 60);
  if (!name) return null;
  return create
    ? db.folder.upsert({ where: { userId_name: { userId, name } }, create: { userId, name }, update: {} })
    : db.folder.findFirst({ where: { userId, name } });
}

async function editSubscription(user: ApiUser, p: URLSearchParams) {
  const action = p.get("ac");
  const target = p.get("s") ?? "";
  const ref = target.startsWith("feed/") ? target.slice("feed/".length) : target;
  if (action === "subscribe") {
    const folder = await folderByLabel(user.id, p.get("a"), true);
    try {
      await subscribe(user.id, new URL(ref).toString(), { folderId: folder?.id ?? null, title: p.get("t") });
      return text("OK");
    } catch (error) {
      return text(`Error=${localizeError(error, "en")}`, 400);
    }
  }
  const sub = await db.subscription.findFirst({ where: { userId: user.id, feed: { OR: [{ id: ref }, { url: ref }] } } });
  if (!sub) return text("Not found", 404);
  if (action === "unsubscribe") {
    await db.subscription.delete({ where: { id: sub.id } });
    return text("OK");
  }
  if (action === "edit") {
    const title = p.get("t");
    const added = await folderByLabel(user.id, p.get("a"), true);
    const removed = await folderByLabel(user.id, p.get("r"));
    await db.subscription.update({
      where: { id: sub.id },
      data: {
        ...(title ? { customTitle: title.trim().slice(0, 200) || null } : {}),
        ...(added ? { folderId: added.id } : removed && removed.id === sub.folderId ? { folderId: null } : {}),
      },
    });
    return text("OK");
  }
  return text("Bad request", 400);
}

async function quickAdd(user: ApiUser, p: URLSearchParams) {
  const query = (p.get("quickadd") ?? "").replace(/^feed\//, "");
  try {
    const [found] = await discoverFeeds(query);
    if (!found) return json({ numResults: 0, query, error: "No feed found" });
    const sub = await subscribe(user.id, found.url, { parsed: found.feed });
    return json({ numResults: 1, query, streamId: `feed/${sub.feedId}`, streamName: sub.feed.title });
  } catch (error) {
    return json({ numResults: 0, query, error: localizeError(error, "en") });
  }
}

async function renameTag(user: ApiUser, p: URLSearchParams) {
  const folder = await folderByLabel(user.id, p.get("s"));
  const dest = normalizeStream(p.get("dest") ?? "");
  const name = dest.startsWith(LABEL) ? dest.slice(LABEL.length).trim().slice(0, 60) : "";
  if (!folder || !name) return text("Bad request", 400);
  await db.folder.update({ where: { id: folder.id }, data: { name } });
  return text("OK");
}

async function disableTag(user: ApiUser, p: URLSearchParams) {
  const folder = await folderByLabel(user.id, p.get("s"));
  if (folder) await db.folder.delete({ where: { id: folder.id } });
  return text("OK");
}

async function tagList(user: ApiUser) {
  const folders = await db.folder.findMany({ where: { userId: user.id }, orderBy: [{ position: "asc" }, { name: "asc" }] });
  return json({ tags: [{ id: STARRED }, ...folders.map((f) => ({ id: `${LABEL}${f.name}`, type: "folder" }))] });
}

async function streamContents(user: ApiUser, p: URLSearchParams, stream: string) {
  const result = await queryStream(user, p, stream);
  if (!result) return text("Not found", 404);
  return json({
    direction: "ltr",
    id: stream,
    title: stream,
    updated: Math.floor(Date.now() / 1000),
    items: await itemsJson(user, result.rows.map((r) => r.id)),
    ...(result.continuation ? { continuation: result.continuation } : {}),
  });
}

export async function handleGReader(request: Request, path: string): Promise<Response> {
  if (path === "accounts/ClientLogin") {
    const p = await readParams(request);
    const password = p.get("Passwd");
    const user = await userFromAppPassword(password);
    if (!user || user.email.toLowerCase() !== (p.get("Email") ?? "").trim().toLowerCase()) return unauthorized();
    return text(`SID=${password}\nLSID=null\nAuth=${password}\n`);
  }

  const user = await authenticate(request);
  if (!user) return unauthorized();
  const p = await readParams(request);
  const api = path.replace(/^reader\/api\/0\//, "");
  await ensureMissingRefs(user.id);

  switch (api) {
    case "token":
      // Clientes pedem um token "T" para as operações de escrita; a autenticação já vem no cabeçalho.
      return text(createHash("sha256").update(`openrss:greader:${user.tokenId}`).digest("hex").slice(0, 57));
    case "user-info":
      return json({ userId: user.id, userName: user.name, userProfileId: user.id, userEmail: user.email });
    case "subscription/list":
      return subscriptionList(user);
    case "subscription/edit":
      return editSubscription(user, p);
    case "subscription/quickadd":
      return quickAdd(user, p);
    case "tag/list":
      return tagList(user);
    case "rename-tag":
      return renameTag(user, p);
    case "disable-tag":
      return disableTag(user, p);
    case "unread-count":
      return unreadCount(user);
    case "edit-tag":
      return editTag(user, p);
    case "mark-all-as-read":
      return markAllAsRead(user, p);
    case "stream/items/ids": {
      const result = await queryStream(user, p, p.get("s") ?? READING_LIST);
      if (!result) return text("Not found", 404);
      const nums = await articleNums(result.rows.map((r) => r.id));
      return json({
        itemRefs: result.rows.map((r) => ({ id: String(nums.get(r.id)), directStreamIds: [], timestampUsec: String(r.publishedAt.getTime() * 1000) })),
        ...(result.continuation ? { continuation: result.continuation } : {}),
      });
    }
    case "stream/items/contents": {
      const nums = p.getAll("i").map(parseItemId).filter((n): n is number => n !== null).slice(0, MAX_ITEMS);
      const ids = await articleIdsFromNums(nums);
      const refs = await articleNums(ids);
      // Responde na ordem dos ids pedidos.
      const byNum = new Map([...refs].map(([id, num]) => [num, id]));
      const ordered = nums.map((n) => byNum.get(n)).filter((id): id is string => Boolean(id));
      return json({ id: READING_LIST, updated: Math.floor(Date.now() / 1000), items: await itemsJson(user, ordered) });
    }
    default:
      if (api.startsWith("stream/contents")) {
        const stream = decodeURIComponent(api.slice("stream/contents".length).replace(/^\//, "")) || p.get("s") || READING_LIST;
        return streamContents(user, p, stream);
      }
      return text("Not found", 404);
  }
}
