import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { staticTranslator } from "@/i18n/static";

// Banco SQLite real (migrations aplicadas) para cobrir regras que dependem do schema, como cascatas.
const dataDir = mkdtempSync(join(tmpdir(), "openrss-test-"));
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = `file:${dataDir}/openrss.db`;
process.env.APP_SECRET = "test-only-random-secret-value";

let currentUser = { id: "", role: "user" };

vi.mock("@/lib/session", () => ({
  getApiUser: async () => (currentUser.id ? currentUser : null),
  requireUser: async () => currentUser,
  requireAdmin: async () => {
    if (currentUser.role !== "admin") throw new Error("not admin");
    return currentUser;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) => staticTranslator("en", namespace as never),
}));

const { runMigrations } = await import("@/lib/setup/migrate");
await runMigrations({ provider: "sqlite", url: process.env.DATABASE_URL });

const { db } = await import("@/lib/db");
const { applyRetention } = await import("@/lib/feeds/refresh");
const { encrypt } = await import("@/lib/crypto");
const { markAllRead } = await import("@/app/actions/articles");
const { saveProviderAction, setSystemDefaultAction } = await import("@/app/actions/ai");
const { saveTtsProviderAction } = await import("@/app/actions/tts");
const { unsubscribeAction, updateSubscriptionAction } = await import("@/app/actions/feeds");
const { applyRuleToExistingAction, deleteRuleAction, previewRuleAction, saveRuleAction } = await import("@/app/actions/rules");
const { applyRulesToArticles } = await import("@/lib/rules/apply");
const { GET: offlineArticles } = await import("@/app/api/offline/articles/route");
const { assignStories } = await import("@/lib/feeds/stories");
const { setRead } = await import("@/app/actions/articles");
const { listArticles } = await import("@/lib/queries");

const OLD = new Date(Date.now() - 400 * 86400000);

async function createUser(id: string, role = "user") {
  return db.user.create({ data: { id, name: id, email: `${id}@example.test`, role } });
}

async function createFeed(url: string, articles: { guid: string; publishedAt?: Date }[]) {
  return db.feed.create({
    data: {
      url,
      title: url,
      articles: { create: articles.map((a) => ({ guid: a.guid, title: a.guid, publishedAt: a.publishedAt ?? new Date() })) },
    },
    include: { articles: true },
  });
}

beforeAll(async () => {
  await createUser("alice", "admin");
  await createUser("bob");
});

afterAll(async () => {
  await db.$disconnect();
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.feed.deleteMany();
  await db.aiProvider.deleteMany();
  await db.ttsProvider.deleteMany();
  await db.appSettings.deleteMany();
  await db.rule.deleteMany();
  currentUser = { id: "alice", role: "admin" };
});

describe("applyRetention", () => {
  it("keeps saved articles (and their feed) after the last subscriber leaves", async () => {
    const feed = await createFeed("https://saved.example/feed", [
      { guid: "kept", publishedAt: OLD },
      { guid: "dropped", publishedAt: OLD },
    ]);
    const kept = feed.articles.find((a) => a.guid === "kept")!;
    await db.userArticle.create({ data: { userId: "bob", articleId: kept.id, isSaved: true, savedAt: new Date() } });

    await applyRetention();

    expect(await db.feed.count({ where: { id: feed.id } })).toBe(1);
    expect((await db.article.findMany({ where: { feedId: feed.id } })).map((a) => a.guid)).toEqual(["kept"]);
  });

  it("removes feeds without subscribers or saved articles", async () => {
    const orphan = await createFeed("https://orphan.example/feed", [{ guid: "recent" }]);
    const followed = await createFeed("https://followed.example/feed", [{ guid: "recent" }]);
    await db.subscription.create({ data: { userId: "bob", feedId: followed.id } });

    await applyRetention();

    expect(await db.feed.count({ where: { id: orphan.id } })).toBe(0);
    expect(await db.feed.count({ where: { id: followed.id } })).toBe(1);
  });
});

describe("markAllRead", () => {
  it("marks new and existing unread states in the feed scope", async () => {
    const feed = await createFeed("https://read.example/feed", [{ guid: "a" }, { guid: "b" }, { guid: "c" }]);
    await db.subscription.create({ data: { userId: "alice", feedId: feed.id } });
    const [a] = feed.articles;
    await db.userArticle.create({ data: { userId: "alice", articleId: a.id, isSaved: true } });

    const result = await markAllRead({ kind: "feed", feedId: feed.id });

    expect(result.count).toBe(3);
    const states = await db.userArticle.findMany({ where: { userId: "alice" } });
    expect(states).toHaveLength(3);
    expect(states.every((s) => s.isRead && s.readAt)).toBe(true);
    expect(states.find((s) => s.articleId === a.id)?.isSaved).toBe(true);
  });
});

describe("authorization", () => {
  it("does not let a user change or remove someone else's subscription", async () => {
    const feed = await createFeed("https://owned.example/feed", []);
    const sub = await db.subscription.create({ data: { userId: "bob", feedId: feed.id } });

    currentUser = { id: "alice", role: "admin" };
    await updateSubscriptionAction(sub.id, { customTitle: "hijacked" });
    await unsubscribeAction(sub.id);

    expect(await db.subscription.findUnique({ where: { id: sub.id } })).toMatchObject({ customTitle: null });
  });

  it("refuses to promote another user's AI provider to system default", async () => {
    const foreign = await db.aiProvider.create({
      data: { userId: "bob", type: "openai", name: "bob", apiKeyEncrypted: encrypt("sk-bob"), defaultModel: "m" },
    });
    const own = await db.aiProvider.create({ data: { userId: "alice", type: "openai", name: "alice", defaultModel: "m" } });

    expect((await setSystemDefaultAction(foreign.id, "m")).ok).toBe(false);
    expect((await db.aiProvider.findUniqueOrThrow({ where: { id: foreign.id } })).userId).toBe("bob");

    expect((await setSystemDefaultAction(own.id, "m")).ok).toBe(true);
    expect((await db.aiProvider.findUniqueOrThrow({ where: { id: own.id } })).userId).toBeNull();
  });

  it("drops the stored AI key when the destination changes", async () => {
    currentUser = { id: "bob", role: "user" };
    const provider = await db.aiProvider.create({
      data: { userId: "bob", type: "openai_compatible", name: "p", baseUrl: "https://a.example/v1", apiKeyEncrypted: encrypt("k") },
    });
    const base = { id: provider.id, scope: "user" as const, type: "openai_compatible" as const, name: "p" };

    await saveProviderAction({ ...base, baseUrl: "https://a.example/v1" });
    expect((await db.aiProvider.findUniqueOrThrow({ where: { id: provider.id } })).apiKeyEncrypted).not.toBeNull();

    await saveProviderAction({ ...base, baseUrl: "https://attacker.example/v1" });
    expect((await db.aiProvider.findUniqueOrThrow({ where: { id: provider.id } })).apiKeyEncrypted).toBeNull();
  });

  it("does not let a TTS provider copied from a global key be pointed elsewhere", async () => {
    const global = await db.aiProvider.create({
      data: { userId: null, type: "openai", name: "global", apiKeyEncrypted: encrypt("sk-admin") },
    });
    currentUser = { id: "bob", role: "user" };
    const tts = { scope: "user" as const, name: "tts", baseUrl: "https://api.openai.com/v1", model: "m", voice: "coral", responseFormat: "mp3" as const, enabled: true };
    expect((await saveTtsProviderAction({ ...tts, sourceAiProviderId: global.id })).ok).toBe(true);
    const created = await db.ttsProvider.findFirstOrThrow({ where: { userId: "bob" } });
    expect(created.apiKeyEncrypted).not.toBeNull();

    await saveTtsProviderAction({ ...tts, id: created.id, baseUrl: "https://attacker.example/v1" });
    const updated = await db.ttsProvider.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.baseUrl).toBe("https://attacker.example/v1");
    expect(updated.apiKeyEncrypted).toBeNull();
  });
});

describe("rules", () => {
  const state = (userId: string, articleId: string) =>
    db.userArticle.findUnique({ where: { userId_articleId: { userId, articleId } } });

  async function rule(userId: string, data: { conditions: unknown; actions: string[]; scope?: string; scopeId?: string | null; name?: string }) {
    return db.rule.create({
      data: {
        userId,
        name: data.name ?? "r",
        scope: data.scope ?? "all",
        scopeId: data.scopeId ?? null,
        conditions: JSON.stringify(data.conditions),
        actions: JSON.stringify(data.actions),
      },
    });
  }

  it("applies text rules only to the owner's state, in feeds they follow", async () => {
    const feed = await createFeed("https://rules.example/feed", [{ guid: "ad" }, { guid: "news" }]);
    await db.article.update({ where: { id: feed.articles[0].id }, data: { title: "Oferta patrocinada" } });
    await db.subscription.createMany({ data: [{ userId: "alice", feedId: feed.id }, { userId: "bob", feedId: feed.id }] });
    const r = await rule("alice", { conditions: [{ field: "title", op: "contains", value: "patrocinad" }], actions: ["markRead", "highlight"] });

    await applyRulesToArticles(feed.articles.map((a) => a.id), "ingest");

    expect(await state("alice", feed.articles[0].id)).toMatchObject({ isRead: true, isHighlighted: true });
    expect(await state("alice", feed.articles[1].id)).toBeNull();
    expect(await state("bob", feed.articles[0].id)).toBeNull();
    expect((await db.rule.findUniqueOrThrow({ where: { id: r.id } })).hitCount).toBe(1);
  });

  it("respects folder scope and waits for the AI score on score rules", async () => {
    const folder = await db.folder.create({ data: { userId: "alice", name: "Tech" } });
    const inFolder = await createFeed("https://tech.example/feed", [{ guid: "t1" }]);
    const outside = await createFeed("https://other.example/feed", [{ guid: "o1" }]);
    await db.subscription.createMany({
      data: [{ userId: "alice", feedId: inFolder.id, folderId: folder.id }, { userId: "alice", feedId: outside.id }],
    });
    await rule("alice", { scope: "folder", scopeId: folder.id, conditions: [{ field: "score", op: "gte", value: "90" }], actions: ["save"] });
    const ids = [inFolder.articles[0].id, outside.articles[0].id];

    await applyRulesToArticles(ids, "ingest");
    expect(await state("alice", ids[0])).toBeNull();

    await db.userArticle.createMany({ data: ids.map((articleId) => ({ userId: "alice", articleId, priorityScore: 95 })) });
    await applyRulesToArticles(ids, "classified", "alice");
    expect(await state("alice", ids[0])).toMatchObject({ isSaved: true });
    expect(await state("alice", ids[1])).toMatchObject({ isSaved: false });
  });

  it("notifies a webhook with the matching article", async () => {
    const received: unknown[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push(JSON.parse(body));
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.ALLOW_PRIVATE_WEBHOOKS = "true";
    try {
      const feed = await createFeed("https://notify.example/feed", [{ guid: "hot" }]);
      await db.subscription.create({ data: { userId: "alice", feedId: feed.id } });
      const saved = await saveRuleAction({
        name: "Tudo",
        scope: "all",
        matchAll: true,
        conditions: [{ field: "title", op: "contains", value: "hot" }],
        actions: ["notify"],
        webhookUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`,
        webhookFormat: "json",
      });
      expect(saved.ok).toBe(true);
      const stored = await db.rule.findFirstOrThrow({ where: { userId: "alice" } });
      expect(stored.webhookEncrypted).not.toContain("127.0.0.1");

      await applyRulesToArticles([feed.articles[0].id], "ingest");
      expect(received).toEqual([expect.objectContaining({ event: "rule.matched", rule: "Tudo", article: expect.objectContaining({ title: "hot" }) })]);
    } finally {
      delete process.env.ALLOW_PRIVATE_WEBHOOKS;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects private webhooks unless explicitly allowed", async () => {
    const res = await saveRuleAction({
      name: "x",
      scope: "all",
      matchAll: true,
      conditions: [{ field: "title", op: "contains", value: "x" }],
      actions: ["notify"],
      webhookUrl: "http://127.0.0.1:9/hook",
      webhookFormat: "json",
    });
    expect(res.ok).toBe(false);
  });

  it("previews and applies to existing articles, without touching other users' rules", async () => {
    const feed = await createFeed("https://existing.example/feed", [{ guid: "a" }, { guid: "b" }]);
    await db.subscription.create({ data: { userId: "alice", feedId: feed.id } });
    const draft = { scope: "all" as const, matchAll: true, conditions: [{ field: "title" as const, op: "equals" as const, value: "a" }] };

    const preview = await previewRuleAction(draft);
    expect(preview).toMatchObject({ ok: true, count: 1, total: 2 });
    expect(await db.userArticle.count()).toBe(0);

    const saved = await saveRuleAction({ ...draft, name: "a", actions: ["markRead"] });
    expect(saved.ok).toBe(true);
    const id = saved.ok ? saved.id : "";
    expect(await applyRuleToExistingAction(id)).toMatchObject({ ok: true, count: 1 });
    expect(await state("alice", feed.articles[0].id)).toMatchObject({ isRead: true });

    currentUser = { id: "bob", role: "user" };
    await deleteRuleAction(id);
    expect(await db.rule.count({ where: { id } })).toBe(1);
    expect((await saveRuleAction({ ...draft, id, name: "hijack", actions: ["save"] })).ok).toBe(false);
  });
});

describe("offline articles API", () => {
  it("lists the user's saved and recently read articles once each", async () => {
    const feed = await createFeed("https://offline.example/feed", [{ guid: "saved" }, { guid: "read" }, { guid: "both" }, { guid: "other" }]);
    await db.subscription.create({ data: { userId: "alice", feedId: feed.id } });
    const [saved, read, both, other] = feed.articles;
    const now = new Date();
    await db.userArticle.createMany({
      data: [
        { userId: "alice", articleId: saved.id, isSaved: true, savedAt: now },
        { userId: "alice", articleId: read.id, isRead: true, readAt: now },
        { userId: "alice", articleId: both.id, isSaved: true, savedAt: now, isRead: true, readAt: now },
        { userId: "bob", articleId: other.id, isSaved: true, savedAt: now },
      ],
    });

    const res = await offlineArticles(new Request("http://localhost/api/offline/articles"));
    const { articles } = (await res.json()) as { articles: { id: string; saved: boolean }[] };
    expect(articles.map((a) => a.id).sort()).toEqual([saved.id, read.id, both.id].sort());
    expect(articles.find((a) => a.id === both.id)?.saved).toBe(true);

    currentUser = { id: "", role: "user" };
    expect((await offlineArticles(new Request("http://localhost/api/offline/articles"))).status).toBe(401);
  });
});

describe("story grouping", () => {
  it("groups the same event across feeds, reads them together and collapses the list", async () => {
    const now = Date.now();
    const g1 = await createFeed("https://g1.example/feed", [{ guid: "a" }, { guid: "x" }]);
    const folha = await createFeed("https://folha.example/feed", [{ guid: "b" }]);
    const same = await createFeed("https://g1-mirror.example/feed", [{ guid: "c" }]);
    const [a, unrelated] = g1.articles;
    const b = folha.articles[0];
    await db.article.update({ where: { id: a.id }, data: { title: "Banco Central mantém Selic em 10,5% ao ano", publishedAt: new Date(now - 3600_000) } });
    await db.article.update({ where: { id: unrelated.id }, data: { title: "Chuva forte alaga ruas de São Paulo", publishedAt: new Date(now - 3600_000) } });
    await db.article.update({ where: { id: b.id }, data: { title: "Selic: Banco Central mantém taxa em 10,5%", publishedAt: new Date(now) } });
    // Mesmo título, mas publicado 5 dias depois: fora da janela.
    await db.article.update({ where: { id: same.articles[0].id }, data: { title: "Banco Central mantém Selic em 10,5% ao ano", publishedAt: new Date(now + 5 * 86400000) } });
    await db.subscription.createMany({ data: [g1, folha, same].map((f) => ({ userId: "alice", feedId: f.id })) });

    await assignStories([a.id, unrelated.id]);
    await assignStories([b.id]);
    await assignStories([same.articles[0].id]);
    const byId = new Map((await db.article.findMany({ select: { id: true, storyId: true } })).map((r) => [r.id, r.storyId]));
    const storyId = byId.get(a.id)!;
    expect(storyId).toBeTruthy();
    expect(byId.get(b.id)).toBe(storyId);
    expect(byId.get(unrelated.id)).toBeNull();
    expect(byId.get(same.articles[0].id)).toBeNull();

    const listed = await listArticles("alice", { kind: "all" }, { unreadOnly: true });
    const lead = listed.items.find((i) => i.storyId === storyId)!;
    expect(listed.items.filter((i) => i.storyId === storyId)).toHaveLength(1);
    expect(lead.related).toHaveLength(1);

    await setRead(b.id, true);
    expect(await db.userArticle.findUnique({ where: { userId_articleId: { userId: "alice", articleId: a.id } } })).toMatchObject({ isRead: true });

    await db.userSettings.update({ where: { userId: "alice" }, data: { groupStories: false } });
    const flat = await listArticles("alice", { kind: "all" }, { unreadOnly: false });
    expect(flat.items.filter((i) => i.storyId === storyId)).toHaveLength(2);
  });
});
