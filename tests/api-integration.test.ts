import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Banco SQLite real: as APIs Fever e Google Reader como um cliente externo as usaria.
const dataDir = mkdtempSync(join(tmpdir(), "openrss-api-test-"));
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = `file:${dataDir}/openrss.db`;
process.env.APP_SECRET = "test-only-random-secret-value";

const { runMigrations } = await import("@/lib/setup/migrate");
await runMigrations({ provider: "sqlite", url: process.env.DATABASE_URL });

const { db } = await import("@/lib/db");
const { createAppPassword } = await import("@/lib/api/tokens");
const { handleGReader, longItemId, parseItemId } = await import("@/lib/api/greader");
const { POST: fever } = await import("@/app/api/fever/route");

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

let password = "";
let otherPassword = "";
let feedId = "";
const articles: { id: string; title: string }[] = [];

beforeAll(async () => {
  const alice = await db.user.create({ data: { id: "alice", name: "Alice", email: "alice@example.test" } });
  const bob = await db.user.create({ data: { id: "bob", name: "Bob", email: "bob@example.test" } });
  password = (await createAppPassword(alice, "Reeder")).password;
  otherPassword = (await createAppPassword(bob, "Bob app")).password;

  const folder = await db.folder.create({ data: { userId: "alice", name: "Tech" } });
  const feed = await db.feed.create({ data: { url: "https://tech.example/feed", title: "Tech Blog", siteUrl: "https://tech.example" } });
  feedId = feed.id;
  await db.subscription.create({ data: { userId: "alice", feedId, folderId: folder.id } });
  const base = Date.parse("2026-09-20T12:00:00Z");
  for (let i = 1; i <= 5; i++) {
    const a = await db.article.create({
      data: { feedId, guid: `g${i}`, title: `Artigo ${i}`, url: `https://tech.example/${i}`, contentHtml: `<p>Texto ${i}</p><script>x()</script>`, publishedAt: new Date(base + i * 3600_000) },
    });
    articles.push(a);
  }
  // Artigo de um feed que a Alice não assina.
  const hidden = await db.feed.create({ data: { url: "https://hidden.example/feed", title: "Hidden" } });
  await db.subscription.create({ data: { userId: "bob", feedId: hidden.id } });
  await db.article.create({ data: { feedId: hidden.id, guid: "h1", title: "Secreto" } });
});

afterAll(async () => {
  await db.$disconnect();
  rmSync(dataDir, { recursive: true, force: true });
});

const form = (data: Record<string, string | string[]>) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) for (const item of [v].flat()) body.append(k, item);
  return body;
};

describe("Fever API", () => {
  const call = async (query: string, data: Record<string, string> = {}, key = md5(`alice@example.test:${password}`)) => {
    const res = await fever(new Request(`http://localhost/api/fever?api&${query}`, { method: "POST", body: form({ api_key: key, ...data }) }));
    return res.json() as Promise<Record<string, unknown>>;
  };

  it("rejects a wrong api_key", async () => {
    expect(await call("items", {}, md5("alice@example.test:wrong"))).toEqual({ api_version: 3, auth: 0 });
  });

  it("lists groups, feeds and paged items with numeric ids", async () => {
    const res = await call("groups&feeds");
    expect(res.auth).toBe(1);
    expect(res.groups).toEqual([{ id: expect.any(Number), title: "Tech" }]);
    const feeds = res.feeds as { id: number; title: string }[];
    expect(feeds).toEqual([expect.objectContaining({ title: "Tech Blog", url: "https://tech.example/feed" })]);
    expect(res.feeds_groups).toEqual([{ group_id: (res.groups as { id: number }[])[0].id, feed_ids: String(feeds[0].id) }]);

    const page = await call("items", { since_id: "0" });
    const items = page.items as { id: number; title: string; html: string; feed_id: number }[];
    expect(items.map((i) => i.title)).toEqual(["Artigo 1", "Artigo 2", "Artigo 3", "Artigo 4", "Artigo 5"]);
    expect(items.every((i) => i.feed_id === feeds[0].id)).toBe(true);
    expect(items[0].html).not.toContain("<script");
    expect(page.total_items).toBe(5);
    const next = await call("items", { since_id: String(items[2].id) });
    expect((next.items as { title: string }[]).map((i) => i.title)).toEqual(["Artigo 4", "Artigo 5"]);
  });

  it("marks items read/saved and whole feeds read", async () => {
    const items = (await call("items", { since_id: "0" })).items as { id: number }[];
    await call("", { mark: "item", as: "read", id: String(items[0].id) });
    await call("", { mark: "item", as: "saved", id: String(items[1].id) });
    const ids = await call("unread_item_ids&saved_item_ids");
    expect(String(ids.unread_item_ids).split(",").map(Number).sort()).toEqual(items.slice(1).map((i) => i.id).sort());
    expect(ids.saved_item_ids).toBe(String(items[1].id));

    const feeds = (await call("feeds")).feeds as { id: number }[];
    const before = Math.floor(Date.parse("2026-09-20T14:30:00Z") / 1000); // até o artigo 2
    await call("", { mark: "feed", as: "read", id: String(feeds[0].id), before: String(before) });
    expect(String((await call("unread_item_ids")).unread_item_ids).split(",")).toHaveLength(3);

    await call("", { mark: "item", as: "unread", id: String(items[0].id) });
    await call("", { mark: "item", as: "unsaved", id: String(items[1].id) });
    expect((await call("saved_item_ids")).saved_item_ids).toBe("");
  });
});

describe("Google Reader API", () => {
  // Começa sem o estado deixado pelos testes da Fever.
  beforeAll(() => db.userArticle.deleteMany({ where: { userId: "alice" } }));

  const call = async (path: string, init: { method?: string; params?: Record<string, string | string[]>; auth?: string | null } = {}) => {
    const url = new URL(`http://localhost/api/greader/${path}`);
    const method = init.method ?? "GET";
    if (method === "GET") for (const [k, v] of form(init.params ?? {})) url.searchParams.append(k, v);
    const headers: Record<string, string> = init.auth === null ? {} : { authorization: `GoogleLogin auth=${init.auth ?? password}` };
    const request = new Request(url, { method, headers, ...(method === "POST" ? { body: form(init.params ?? {}) } : {}) });
    return handleGReader(request, path);
  };
  const jsonOf = async (res: Response) => res.json() as Promise<Record<string, unknown>>;

  it("logs in with email and app password only", async () => {
    const ok = await call("accounts/ClientLogin", { method: "POST", auth: null, params: { Email: "Alice@Example.test", Passwd: password } });
    expect(await ok.text()).toContain(`Auth=${password}`);
    const wrongUser = await call("accounts/ClientLogin", { method: "POST", auth: null, params: { Email: "alice@example.test", Passwd: otherPassword } });
    expect(wrongUser.status).toBe(401);
    expect((await call("reader/api/0/user-info", { auth: "nope" })).status).toBe(401);
  });

  it("lists subscriptions, tags and unread counts", async () => {
    const subs = await jsonOf(await call("reader/api/0/subscription/list", { params: { output: "json" } }));
    expect(subs.subscriptions).toEqual([
      expect.objectContaining({ id: `feed/${feedId}`, title: "Tech Blog", categories: [{ id: "user/-/label/Tech", label: "Tech", type: "folder" }] }),
    ]);
    const tags = await jsonOf(await call("reader/api/0/tag/list"));
    expect(tags.tags).toContainEqual({ id: "user/-/label/Tech", type: "folder" });
    const counts = (await jsonOf(await call("reader/api/0/unread-count"))).unreadcounts as { id: string; count: number }[];
    expect(counts.find((c) => c.id === "user/-/state/com.google/reading-list")?.count).toBe(5);
    expect(counts.find((c) => c.id === "user/-/label/Tech")?.count).toBe(5);
  });

  it("pages item ids, fetches contents and edits read/starred state", async () => {
    const first = await jsonOf(await call("reader/api/0/stream/items/ids", { params: { s: "user/-/state/com.google/reading-list", n: "3", xt: "user/-/state/com.google/read" } }));
    const refs = first.itemRefs as { id: string }[];
    expect(refs).toHaveLength(3);
    expect(first.continuation).toBe("3");
    const rest = await jsonOf(await call("reader/api/0/stream/items/ids", { params: { s: `feed/${feedId}`, n: "3", c: "3" } }));
    expect((rest.itemRefs as unknown[]).length).toBe(2);

    const contents = await jsonOf(await call("reader/api/0/stream/items/contents", { method: "POST", params: { i: refs.map((r) => r.id) } }));
    const items = contents.items as { id: string; title: string; categories: string[]; summary: { content: string }; origin: { streamId: string } }[];
    expect(items.map((i) => i.title)).toEqual(["Artigo 5", "Artigo 4", "Artigo 3"]);
    expect(items[0].id).toBe(longItemId(Number(refs[0].id)));
    expect(items[0].origin.streamId).toBe(`feed/${feedId}`);
    expect(items[0].summary.content).not.toContain("<script");

    await call("reader/api/0/edit-tag", { method: "POST", params: { i: [items[0].id, refs[1].id], a: "user/-/state/com.google/read" } });
    await call("reader/api/0/edit-tag", { method: "POST", params: { i: items[2].id, a: "user/-/state/com.google/starred" } });
    const starred = await jsonOf(await call("reader/api/0/stream/contents/user%2F-%2Fstate%2Fcom.google%2Fstarred"));
    expect((starred.items as { title: string }[]).map((i) => i.title)).toEqual(["Artigo 3"]);
    const unread = await jsonOf(await call("reader/api/0/stream/items/ids", { params: { s: "user/-/state/com.google/reading-list", xt: "user/-/state/com.google/read", n: "100" } }));
    expect((unread.itemRefs as unknown[]).length).toBe(3);

    await call("reader/api/0/mark-all-as-read", { method: "POST", params: { s: "user/-/label/Tech" } });
    const counts = (await jsonOf(await call("reader/api/0/unread-count"))).unreadcounts as { id: string; count: number }[];
    expect(counts.find((c) => c.id === "user/-/state/com.google/reading-list")?.count).toBe(0);
  });

  it("does not expose or modify other users' articles", async () => {
    const secret = await db.article.findFirstOrThrow({ where: { title: "Secreto" } });
    const ref = await db.articleRef.upsert({ where: { articleId: secret.id }, create: { articleId: secret.id }, update: {} });
    const contents = await jsonOf(await call("reader/api/0/stream/items/contents", { method: "POST", params: { i: String(ref.id) } }));
    expect(contents.items).toEqual([]);
    await call("reader/api/0/edit-tag", { method: "POST", params: { i: String(ref.id), a: "user/-/state/com.google/starred" } });
    expect(await db.userArticle.count({ where: { userId: "alice", articleId: secret.id } })).toBe(0);
  });

  it("renames subscriptions and moves them between labels", async () => {
    await call("reader/api/0/subscription/edit", { method: "POST", params: { ac: "edit", s: `feed/${feedId}`, t: "Blog de Tech", a: "user/-/label/Leitura" } });
    const subs = (await jsonOf(await call("reader/api/0/subscription/list"))).subscriptions as { title: string; categories: { label: string }[] }[];
    expect(subs[0]).toMatchObject({ title: "Blog de Tech", categories: [{ label: "Leitura" }] });
    await call("reader/api/0/subscription/edit", { method: "POST", params: { ac: "unsubscribe", s: `feed/${feedId}` } });
    expect(await db.subscription.count({ where: { userId: "alice" } })).toBe(0);
  });

  it("parses long, hex and decimal item ids", () => {
    expect(parseItemId(longItemId(255))).toBe(255);
    expect(parseItemId("00000000000000ff")).toBe(255);
    expect(parseItemId("255")).toBe(255);
    expect(parseItemId("abc")).toBeNull();
  });
});
