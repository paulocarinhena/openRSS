import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { readDatabaseProvider, readDatabaseUrl, type DatabaseProvider } from "@/lib/env";
import { lazyObject } from "@/lib/lazy";

let provider: DatabaseProvider | undefined;

/** Provider em uso. Lança SetupRequiredError enquanto o assistente não concluir. */
export function getDbProvider() {
  return (provider ??= readDatabaseProvider());
}

function createClient() {
  const dbProvider = getDbProvider();
  const url = readDatabaseUrl(dbProvider);

  if (dbProvider === "postgresql") {
    // Client gerado a partir de prisma/postgres/schema.prisma (modelos idênticos, tipos compatíveis).
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
    const { PrismaClient: PgClient } = require("@/generated/prisma-postgres/client") as { PrismaClient: typeof PrismaClient };
    /* eslint-enable @typescript-eslint/no-require-imports */
    return new PgClient({ adapter: new PrismaPg({ connectionString: url }) });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3") as typeof import("@prisma/adapter-better-sqlite3");
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: url.replace(/^file:/, ""), timeout: 5000 }),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Instanciado na primeira consulta: em modo setup os módulos carregam sem tocar no banco.
export const db = lazyObject<PrismaClient>(() => {
  const client = globalForPrisma.prisma ?? createClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
});

/** Filtro `contains` case-insensitive portável (SQLite já é insensível para ASCII). */
export function icontains(value: string) {
  return getDbProvider() === "postgresql"
    ? { contains: value, mode: "insensitive" as const }
    : { contains: value };
}

/** Ajustes de SQLite para concorrência com poucos usuários. */
export async function tuneDatabase() {
  if (getDbProvider() !== "sqlite") return;
  await db.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
  await db.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
}
