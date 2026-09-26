import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SetupRequiredError,
  isSetupRequired,
  isValidSetupToken,
  loadStoredConfig,
  readAppSecret,
  readDatabaseProvider,
  readDatabaseUrl,
  resetConfigCache,
  resolveDatabaseConfig,
  resolveRuntimeConfig,
  setupToken,
  sqliteUrl,
  writeStoredConfig,
} from "../src/lib/env";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openrss-env-"));
  resetConfigCache();
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("database configuration", () => {
  it("requires setup when neither env nor config.json define a database", () => {
    expect(resolveDatabaseConfig({ OPENRSS_DATA_DIR: dataDir })).toBeNull();
    expect(isSetupRequired({ OPENRSS_DATA_DIR: dataDir })).toBe(true);
    expect(() => readDatabaseProvider({ OPENRSS_DATA_DIR: dataDir })).toThrow(SetupRequiredError);
  });

  it("uses env vars when present, inferring the provider from the URL", () => {
    expect(resolveDatabaseConfig({ DATABASE_URL: "file:./x.db", OPENRSS_DATA_DIR: dataDir })).toEqual({
      provider: "sqlite",
      url: "file:./x.db",
      source: "env",
    });
    expect(resolveDatabaseConfig({ DATABASE_URL: "postgresql://h/db", OPENRSS_DATA_DIR: dataDir })).toMatchObject({
      provider: "postgresql",
      source: "env",
    });
    expect(resolveDatabaseConfig({ DATABASE_PROVIDER: "sqlite", OPENRSS_DATA_DIR: dataDir })).toMatchObject({
      provider: "sqlite",
      url: sqliteUrl(dataDir),
    });
    expect(readDatabaseProvider({ DATABASE_PROVIDER: "postgresql", DATABASE_URL: "postgresql://h/db" })).toBe("postgresql");
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

  it("falls back to config.json and derives the sqlite path from the data dir", () => {
    const env = { OPENRSS_DATA_DIR: dataDir };
    writeStoredConfig(dataDir, { version: 1, database: { provider: "sqlite" } });
    expect(resolveDatabaseConfig(env)).toEqual({ provider: "sqlite", url: sqliteUrl(dataDir), source: "file" });
    expect(isSetupRequired(env)).toBe(false);

    writeStoredConfig(dataDir, { version: 1, database: { provider: "postgresql", url: "postgresql://u:p@h:5432/db" } });
    expect(resolveDatabaseConfig(env)).toEqual({ provider: "postgresql", url: "postgresql://u:p@h:5432/db", source: "file" });
  });

  it("lets env override config.json", () => {
    writeStoredConfig(dataDir, { version: 1, database: { provider: "postgresql", url: "postgresql://h/file" } });
    expect(resolveDatabaseConfig({ DATABASE_URL: "postgresql://h/env", OPENRSS_DATA_DIR: dataDir })).toMatchObject({
      url: "postgresql://h/env",
      source: "env",
    });
  });

  it("re-reads config.json when it changes on disk", () => {
    const env = { OPENRSS_DATA_DIR: dataDir };
    expect(loadStoredConfig(dataDir)).toBeNull();
    writeStoredConfig(dataDir, { version: 1, appSecret: "s".repeat(32) });
    expect(isSetupRequired(env)).toBe(true);
    writeStoredConfig(dataDir, { version: 1, appSecret: "s".repeat(32), database: { provider: "sqlite" } });
    expect(isSetupRequired(env)).toBe(false);
  });
});

describe("app secret", () => {
  it("rejects short and placeholder secrets from the environment", () => {
    expect(() => readAppSecret({ APP_SECRET: "too-short" })).toThrow("APP_SECRET muito curto");
    expect(() =>
      readAppSecret({ APP_SECRET: "troque-este-segredo-por-um-valor-aleatorio" }),
    ).toThrow("valor de exemplo inseguro");
  });

  it("prefers the environment, then config.json", () => {
    writeStoredConfig(dataDir, { version: 1, appSecret: "file-secret-with-enough-length" });
    expect(readAppSecret({ APP_SECRET: "env-secret-with-enough-length", OPENRSS_DATA_DIR: dataDir })).toBe(
      "env-secret-with-enough-length",
    );
    expect(readAppSecret({ OPENRSS_DATA_DIR: dataDir })).toBe("file-secret-with-enough-length");
  });

  it("generates and persists a secret when none is configured", () => {
    const env = { OPENRSS_DATA_DIR: dataDir };
    const secret = readAppSecret(env);
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(JSON.parse(readFileSync(join(dataDir, "config.json"), "utf8"))).toEqual({ version: 1, appSecret: secret });
    expect(readAppSecret(env)).toBe(secret);
  });

  it("keeps the database section when persisting a generated secret", () => {
    writeStoredConfig(dataDir, { version: 1, database: { provider: "sqlite" } });
    const { database, appSecret } = resolveRuntimeConfig({ OPENRSS_DATA_DIR: dataDir });
    expect(database?.provider).toBe("sqlite");
    expect(loadStoredConfig(dataDir)).toEqual({ version: 1, appSecret, database: { provider: "sqlite" } });
  });
});

describe("setup token", () => {
  it("is derived from the app secret and checked exactly", () => {
    const env = { APP_SECRET: "a-random-secret-for-tests", OPENRSS_DATA_DIR: dataDir };
    const token = setupToken(env);
    expect(token).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
    expect(isValidSetupToken(` ${token.toUpperCase()} `, env)).toBe(true);
    expect(isValidSetupToken("0000-0000-0000-0000", env)).toBe(false);
    expect(isValidSetupToken(undefined, env)).toBe(false);
    expect(setupToken({ ...env, APP_SECRET: "another-random-secret-value" })).not.toBe(token);
  });
});
