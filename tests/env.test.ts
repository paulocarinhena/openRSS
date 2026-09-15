import { describe, expect, it } from "vitest";
import {
  readAppSecret,
  readDatabaseProvider,
  readDatabaseUrl,
  validateRuntimeEnvironment,
} from "../src/lib/env";

describe("environment validation", () => {
  it("defaults the database provider to sqlite", () => {
    expect(readDatabaseProvider({})).toBe("sqlite");
  });

  it("accepts each supported database provider", () => {
    expect(readDatabaseProvider({ DATABASE_PROVIDER: "sqlite" })).toBe("sqlite");
    expect(readDatabaseProvider({ DATABASE_PROVIDER: "postgresql" })).toBe("postgresql");
  });

  it("rejects an unknown database provider clearly", () => {
    expect(() => readDatabaseProvider({ DATABASE_PROVIDER: "mysql" })).toThrow(
      'DATABASE_PROVIDER inválido: "mysql". Use "sqlite" ou "postgresql".',
    );
  });

  it("requires a URL compatible with the selected database provider", () => {
    expect(() => readDatabaseUrl("postgresql", {})).toThrow("postgresql://");
    expect(() => readDatabaseUrl("postgresql", { DATABASE_URL: "file:./wrong.db" })).toThrow("postgresql://");
    expect(() => readDatabaseUrl("sqlite", { DATABASE_URL: "postgresql://localhost/openrss" })).toThrow("file:");
  });

  it("rejects missing, short, and placeholder app secrets", () => {
    expect(() => readAppSecret({})).toThrow("APP_SECRET não definido");
    expect(() => readAppSecret({ APP_SECRET: "too-short" })).toThrow("APP_SECRET muito curto");
    expect(() =>
      readAppSecret({ APP_SECRET: "troque-este-segredo-por-um-valor-aleatorio" }),
    ).toThrow("valor de exemplo inseguro");
  });

  it("returns validated runtime settings", () => {
    expect(
      validateRuntimeEnvironment({
        APP_SECRET: "a-secure-random-secret-for-tests",
        DATABASE_PROVIDER: "postgresql",
        DATABASE_URL: "postgresql://localhost/openrss",
      }),
    ).toEqual({
      appSecret: "a-secure-random-secret-for-tests",
      databaseProvider: "postgresql",
      databaseUrl: "postgresql://localhost/openrss",
    });
  });
});
