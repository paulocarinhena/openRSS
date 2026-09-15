"use server";

import { Client, escapeIdentifier } from "pg";
import { z } from "zod";
import {
  isSetupRequired,
  loadStoredConfig,
  readDataDir,
  resetConfigCache,
  sqliteUrl,
  writeStoredConfig,
  type DatabaseConfig,
} from "@/lib/env";
import { runMigrations } from "@/lib/setup/migrate";

const postgresSchema = z.object({
  host: z.string().trim().min(1, "Informe o host."),
  port: z.coerce.number().int().min(1).max(65535, "Porta inválida."),
  user: z.string().trim().min(1, "Informe o usuário."),
  password: z.string(),
  database: z.string().trim().regex(/^[A-Za-z0-9_]+$/, "Nome do banco: use apenas letras, números e _."),
  ssl: z.boolean().optional(),
});

export type PostgresInput = {
  host: string;
  port: number | string;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
};

export type SetupInput =
  | { provider: "sqlite" }
  | ({ provider: "postgresql"; createDatabase?: boolean } & PostgresInput);

type ConnectionResult = { status: "ok" } | { status: "missing-database" } | { status: "error"; message: string };

function assertSetupMode() {
  // Depois de configurado, o assistente deixa de existir: ninguém reconfigura pela web.
  if (!isSetupRequired()) throw new Error("A instância já está configurada.");
}

function postgresUrl(input: z.output<typeof postgresSchema>, database = input.database) {
  const auth = `${encodeURIComponent(input.user)}:${encodeURIComponent(input.password)}`;
  const url = `postgresql://${auth}@${input.host}:${input.port}/${encodeURIComponent(database)}`;
  return input.ssl ? `${url}?sslmode=require` : url;
}

function describePgError(error: unknown) {
  const err = error as NodeJS.ErrnoException & { code?: string };
  switch (err.code) {
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EHOSTUNREACH":
      return "Não foi possível alcançar o servidor. Verifique host e porta.";
    case "ETIMEDOUT":
      return "Tempo esgotado ao conectar. Verifique host, porta e firewall.";
    case "28P01":
    case "28000":
      return "Usuário ou senha inválidos.";
    case "42501":
      return "O usuário não tem permissão para criar bancos (CREATEDB).";
    default:
      return err.message || "Falha ao conectar ao PostgreSQL.";
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
    return { status: "error", message: describePgError(error) };
  }
}

export async function testPostgresConnection(input: PostgresInput): Promise<ConnectionResult> {
  assertSetupMode();
  const parsed = postgresSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return probePostgres(parsed.data);
}

export async function completeSetup(input: SetupInput): Promise<{ status: "ok" } | { status: "error"; message: string }> {
  assertSetupMode();
  const dataDir = readDataDir();

  let database: DatabaseConfig;
  if (input.provider === "sqlite") {
    database = { provider: "sqlite", url: sqliteUrl(dataDir) };
  } else {
    const parsed = postgresSchema.safeParse(input);
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };

    if (input.createDatabase) {
      try {
        // O banco de manutenção "postgres" existe em qualquer instalação padrão.
        await withPgClient(postgresUrl(parsed.data, "postgres"), (client) =>
          client.query(`CREATE DATABASE ${escapeIdentifier(parsed.data.database)}`),
        );
      } catch (error) {
        return { status: "error", message: describePgError(error) };
      }
    }

    const probe = await probePostgres(parsed.data);
    if (probe.status === "missing-database") return { status: "error", message: `O banco "${parsed.data.database}" não existe.` };
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
