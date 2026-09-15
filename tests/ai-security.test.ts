import { describe, expect, it } from "vitest";
import { assertSafeModelListingUrl } from "@/lib/ai/providers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPrivateAddress } from "@/lib/network";

describe("AI provider model listing security", () => {
  it.each([
    "http://localhost:11434/v1",
    "http://127.0.0.1:11434/v1",
    "http://10.0.0.1/v1",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/v1",
  ])("blocks private destination %s", async (url) => {
    await expect(assertSafeModelListingUrl(url)).rejects.toThrow("rede privada");
  });

  it("allows a private destination only when explicitly authorized", async () => {
    await expect(assertSafeModelListingUrl("http://127.0.0.1:11434/v1", true)).resolves.toBeInstanceOf(URL);
  });

  it("rejects non-HTTP protocols and URL credentials", async () => {
    await expect(assertSafeModelListingUrl("file:///etc/passwd")).rejects.toThrow("inválida");
    await expect(assertSafeModelListingUrl("https://user:secret@example.com/v1")).rejects.toThrow("inválida");
  });

  it.each(["fe90::1", "febf::1", "::ffff:127.0.0.1", "::ffff:7f00:1"])("blocks private IPv6 form %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });
});

describe("AI summary cache schema", () => {
  it("partitions summaries by provider and credential owner", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.base.prisma"), "utf8");
    expect(schema).toContain("@@unique([articleId, providerId, userId, model, language])");
  });
});
