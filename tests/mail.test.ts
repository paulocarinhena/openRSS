import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { startFakeSmtp, decodeMail } from "./helpers/fake-smtp";
import { startFakeOpenAI } from "./helpers/fake-openai";

// Banco SQLite real + SMTP falso: redefinição de senha e digest por e-mail de ponta a ponta.
const dataDir = mkdtempSync(join(tmpdir(), "openrss-mail-test-"));
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = `file:${dataDir}/openrss.db`;
process.env.APP_SECRET = "test-only-random-secret-value";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
const smtp = await startFakeSmtp();
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(smtp.port);
process.env.SMTP_SECURE = "false";
process.env.SMTP_FROM = "openRSS <noreply@example.test>";

const { runMigrations } = await import("@/lib/setup/migrate");
await runMigrations({ provider: "sqlite", url: process.env.DATABASE_URL });
const { db } = await import("@/lib/db");
const { auth } = await import("@/lib/auth");
const { readSmtpConfig } = await import("@/lib/mail");
const { runScheduledDigests } = await import("@/lib/ai/digest");

afterAll(async () => {
  await smtp.close();
  await db.$disconnect();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("SMTP config", () => {
  it("is off without host and infers TLS from the port", () => {
    expect(readSmtpConfig({})).toBeNull();
    expect(readSmtpConfig({ SMTP_HOST: "smtp.x", SMTP_USER: "me@x" })).toMatchObject({ port: 587, secure: false, from: "me@x" });
    expect(readSmtpConfig({ SMTP_HOST: "smtp.x", SMTP_PORT: "465", SMTP_FROM: "a@x" })).toMatchObject({ secure: true });
    expect(readSmtpConfig({ SMTP_HOST: "smtp.x" })).toBeNull(); // sem remetente
  });
});

describe("password reset by email", () => {
  it("sends a link whose token changes the password", async () => {
    await auth.api.signUpEmail({ body: { name: "Ana", email: "ana@example.test", password: "senha-antiga-1" } });
    await auth.api.requestPasswordReset({ body: { email: "ana@example.test", redirectTo: "/reset-password" } });
    const mail = decodeMail(smtp.messages.at(-1)!.data);
    expect(smtp.messages.at(-1)!.to.join()).toContain("ana@example.test");
    const link = /http:\/\/localhost:3000\/api\/auth\/reset-password\/([A-Za-z0-9_-]+)/.exec(mail);
    expect(link).not.toBeNull();

    await auth.api.resetPassword({ body: { newPassword: "senha-nova-123", token: link![1] } });
    await expect(auth.api.signInEmail({ body: { email: "ana@example.test", password: "senha-antiga-1" } })).rejects.toThrow();
    const ok = await auth.api.signInEmail({ body: { email: "ana@example.test", password: "senha-nova-123" } });
    expect(ok.user.email).toBe("ana@example.test");

    // E-mail inexistente: nenhuma mensagem nova (e a API responde igual).
    const before = smtp.messages.length;
    await auth.api.requestPasswordReset({ body: { email: "ninguem@example.test", redirectTo: "/reset-password" } });
    expect(smtp.messages.length).toBe(before);
  });
});

describe("digest by email", () => {
  it("emails the scheduled digest with absolute article links", async () => {
    const fake = await startFakeOpenAI({ answer: () => "## Tecnologia\nNovidades em [Artigo X](/article/abc123)." });
    try {
      const user = await db.user.findFirstOrThrow({ where: { email: "ana@example.test" } });
      await db.aiProvider.create({ data: { userId: null, type: "openai_compatible", name: "fake", baseUrl: fake.baseUrl, defaultModel: "m" } });
      const feed = await db.feed.create({ data: { url: "https://digest.example/feed", title: "Feed" } });
      await db.article.create({ data: { feedId: feed.id, guid: "d1", title: "Artigo X", snippet: "texto" } });
      await db.subscription.create({ data: { userId: user.id, feedId: feed.id } });
      await db.userSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id, digestEnabled: true, digestEmail: true, digestHour: 0, timezone: "UTC" },
        update: { digestEnabled: true, digestEmail: true, digestHour: 0, timezone: "UTC" },
      });

      const before = smtp.messages.length;
      await runScheduledDigests();
      expect(smtp.messages.length).toBe(before + 1);
      const mail = decodeMail(smtp.messages.at(-1)!.data);
      expect(mail).toContain("http://localhost:3000/article/abc123");
      expect(mail).toContain("Tecnologia");
    } finally {
      await fake.close();
    }
  });
});

describe("digest email HTML", () => {
  it("makes internal links absolute, drops remote images and raw HTML", async () => {
    const { digestHtml } = await import("@/lib/ai/digest-mail");
    const html = digestHtml("## Tema\n[Artigo](/article/x) ![foto](https://tracker.example/p.png) <script>x()</script>", "https://rss.example");
    expect(html).toContain('href="https://rss.example/article/x"');
    expect(html).not.toContain("tracker.example");
    expect(html).toContain("foto");
    expect(html).not.toContain("<script");
  });
});
