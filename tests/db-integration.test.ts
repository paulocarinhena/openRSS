import { mkdtempSync, rmSync } from "node:fs";
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
