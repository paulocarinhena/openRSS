"use server";

import { getTranslations } from "next-intl/server";
import { Client, escapeIdentifier } from "pg";
import { z } from "zod";
import {
  isSetupRequired,
  isValidSetupToken,
  loadStoredConfig,
  readDataDir,
  resetConfigCache,
  sqliteUrl,
  writeStoredConfig,
  type DatabaseConfig,
} from "@/lib/env";
import { runMigrations } from "@/lib/setup/migrate";
import { actionErrorMessage } from "@/lib/action-errors";

// Mensagens do zod são chaves de setup.errors.
const postgresSchema = z.object({
  host: z.string().trim().min(1, "hostRequired"),
  port: z.coerce.number().int().min(1, "invalidPort").max(65535, "invalidPort"),
  user: z.string().trim().min(1, "userRequired"),
  password: z.string(),
  database: z.string().trim().regex(/^[A-Za-z0-9_]+$/, "invalidDatabaseName"),
  ssl: z.boolean().optional(),
});

const errors = () => getTranslations("setup.errors");

export type PostgresInput = {
  host: string;
  port: number | string;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
};

export type SetupInput = { token: string } & (
  | { provider: "sqlite" }
  | ({ provider: "postgresql"; createDatabase?: boolean } & PostgresInput)
);

type ConnectionResult = { status: "ok" } | { status: "missing-database" } | { status: "error"; message: string };

async function assertSetupMode() {
  // Depois de configurado, o assistente deixa de existir: ninguém reconfigura pela web.
  if (!isSetupRequired()) throw new Error((await errors())("alreadyConfigured"));
}

const invalidToken = async () => ({ status: "error" as const, message: (await errors())("invalidToken") });

function postgresUrl(input: z.output<typeof postgresSchema>, database = input.database) {
  const auth = `${encodeURIComponent(input.user)}:${encodeURIComponent(input.password)}`;
  const url = `postgresql://${auth}@${input.host}:${input.port}/${encodeURIComponent(database)}`;
  return input.ssl ? `${url}?sslmode=require` : url;
}

async function describePgError(error: unknown) {
  const t = await errors();
  const err = error as NodeJS.ErrnoException & { code?: string };
  switch (err.code) {
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EHOSTUNREACH":
      return t("pgUnreachable");
    case "ETIMEDOUT":
      return t("pgTimeout");
    case "28P01":
    case "28000":
      return t("pgBadCredentials");
    case "42501":
      return t("pgNoCreateDb");
    default:
      return err.message || t("pgConnectFailed");
  }
}

async function withPgClient<T>(connectionString: string, fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function probePostgres(input: z.output<typeof postgresSchema>): Promise<ConnectionResult> {
  try {
    await withPgClient(postgresUrl(input), (client) => client.query("SELECT 1"));
    return { status: "ok" };
  } catch (error) {
    if ((error as { code?: string }).code === "3D000") return { status: "missing-database" };
    return { status: "error", message: await describePgError(error) };
  }
}

export async function testPostgresConnection(token: string, input: PostgresInput): Promise<ConnectionResult> {
  await assertSetupMode();
  if (!isValidSetupToken(token)) return invalidToken();
  const parsed = postgresSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: actionErrorMessage(await errors(), parsed.error) };
  return probePostgres(parsed.data);
}

export async function completeSetup(input: SetupInput): Promise<{ status: "ok" } | { status: "error"; message: string }> {
  await assertSetupMode();
  if (!isValidSetupToken(input.token)) return invalidToken();
  const dataDir = readDataDir();

  let database: DatabaseConfig;
  if (input.provider === "sqlite") {
    database = { provider: "sqlite", url: sqliteUrl(dataDir) };
  } else {
    const parsed = postgresSchema.safeParse(input);
    if (!parsed.success) return { status: "error", message: actionErrorMessage(await errors(), parsed.error) };

    if (input.createDatabase) {
      try {
        // O banco de manutenção "postgres" existe em qualquer instalação padrão.
        await withPgClient(postgresUrl(parsed.data, "postgres"), (client) =>
          client.query(`CREATE DATABASE ${escapeIdentifier(parsed.data.database)}`),
        );
      } catch (error) {
        return { status: "error", message: await describePgError(error) };
      }
    }

    const probe = await probePostgres(parsed.data);
    if (probe.status === "missing-database") return { status: "error", message: (await errors())("databaseMissing", { database: parsed.data.database }) };
    if (probe.status === "error") return probe;
    database = { provider: "postgresql", url: postgresUrl(parsed.data) };
  }

  const previous = loadStoredConfig(dataDir);
  try {
    await runMigrations(database);
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  writeStoredConfig(dataDir, {
    version: 1,
    ...previous,
    database: database.provider === "sqlite" ? { provider: "sqlite" } : { provider: "postgresql", url: database.url },
  });
  resetConfigCache();

  if (process.env.DISABLE_SCHEDULER !== "true") {
    const { startScheduler } = await import("@/lib/jobs/scheduler");
    await startScheduler();
  }
  return { status: "ok" };
}
