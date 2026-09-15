import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt, maskKey } from "@/lib/crypto";
import { buildSchema } from "../scripts/gen-schemas";
import { dayInTimezone, hourInTimezone } from "@/lib/ai/digest";

beforeAll(() => {
  process.env.APP_SECRET = "test-secret-with-enough-length";
});

describe("crypto", () => {
  it("criptografa e descriptografa", () => {
    const payload = encrypt("sk-test-123456");
    expect(payload).not.toContain("sk-test");
    expect(decrypt(payload)).toBe("sk-test-123456");
  });

  it("detecta adulteração", () => {
    const parts = encrypt("segredo").split(".");
    parts[3] = Buffer.from("xxxx").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("mascara chaves", () => {
    expect(maskKey("sk-abcdefghijkl")).toBe("sk-••••ijkl");
  });
});

describe("gen-schemas", () => {
  const base = `generator client {\n  provider = "prisma-client"\n  output   = "../../src/generated/prisma"\n}\nmodel A { id String @id }\n`;

  it("gera datasource e output por provider", () => {
    const sqlite = buildSchema(base, "sqlite");
    const pg = buildSchema(base, "postgresql");
    expect(sqlite).toContain('provider = "sqlite"');
    expect(sqlite).toContain('"../../src/generated/prisma"');
    expect(pg).toContain('provider = "postgresql"');
    expect(pg).toContain('"../../src/generated/prisma-postgres"');
    expect(pg).toContain("model A");
  });
});

describe("digest timezone helpers", () => {
  it("calcula dia e hora no fuso", () => {
    const date = new Date("2026-09-14T02:30:00Z");
    expect(dayInTimezone(date, "America/Sao_Paulo")).toBe("2026-09-13");
    expect(hourInTimezone(date, "America/Sao_Paulo")).toBe(23);
    expect(dayInTimezone(date, "UTC")).toBe("2026-09-14");
  });
});
