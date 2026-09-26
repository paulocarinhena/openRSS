import { describe, expect, it } from "vitest";
import { assertSafeModelListingUrl } from "@/lib/ai/providers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPrivateAddress } from "@/lib/network";
import { LocalizedError, localizeError, serializeError } from "@/lib/localized-error";

describe("AI provider model listing security", () => {
  it.each([
    "http://localhost:11434/v1",
    "http://127.0.0.1:11434/v1",
    "http://10.0.0.1/v1",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/v1",
  ])("blocks private destination %s", async (url) => {
    await expect(assertSafeModelListingUrl(url)).rejects.toMatchObject({ key: "privateNetworkBaseUrl" });
  });

  it("allows a private destination only when explicitly authorized", async () => {
    await expect(assertSafeModelListingUrl("http://127.0.0.1:11434/v1", true)).resolves.toBeInstanceOf(URL);
  });

  it("rejects non-HTTP protocols and URL credentials", async () => {
    await expect(assertSafeModelListingUrl("file:///etc/passwd")).rejects.toMatchObject({ key: "invalidListingBaseUrl" });
    await expect(assertSafeModelListingUrl("https://user:secret@example.com/v1")).rejects.toMatchObject({ key: "invalidListingBaseUrl" });
  });

  it.each(["fe90::1", "febf::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "64:ff9b:1::a00:1", "2002:7f00:1::1"])("blocks private IPv6 form %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });
});

describe("localized server errors", () => {
  it("translates live errors and round-trips stored ones", () => {
    const err = new LocalizedError("httpStatus", { status: 404 });
    expect(err.message).toBe("HTTP 404");
    expect(localizeError(new LocalizedError("privateNetwork"), "pt-BR")).toBe("O destino aponta para uma rede privada não autorizada.");
    expect(localizeError(serializeError(new LocalizedError("feedRefreshing")), "es")).toBe("Este feed ya se está actualizando.");
    expect(localizeError("mensagem antiga", "en")).toBe("mensagem antiga");
  });
});

describe("AI summary cache schema", () => {
  it("partitions summaries by provider and credential owner", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.base.prisma"), "utf8");
    expect(schema).toContain("@@unique([articleId, providerId, userId, model, language, kind]");
  });
});
