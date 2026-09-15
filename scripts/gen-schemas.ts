/**
 * Gera prisma/sqlite/schema.prisma e prisma/postgres/schema.prisma a partir de
 * prisma/schema.base.prisma. O Prisma não aceita provider dinâmico, então cada
 * provider tem seu próprio schema + pasta de migrations, com modelos idênticos.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PROVIDERS = ["sqlite", "postgresql"] as const;
export type DbProvider = (typeof PROVIDERS)[number];

export const providerDir = (p: DbProvider) => (p === "postgresql" ? "postgres" : "sqlite");

/**
 * O client do Prisma 7 fica amarrado ao provider na geração, então cada provider
 * gera o seu client: SQLite em src/generated/prisma (também usado para os tipos)
 * e Postgres em src/generated/prisma-postgres. O db.ts escolhe em runtime.
 */
export const clientOutput = (p: DbProvider) => (p === "postgresql" ? "../../src/generated/prisma-postgres" : "../../src/generated/prisma");

export function buildSchema(base: string, provider: DbProvider): string {
  const header = `// ARQUIVO GERADO por scripts/gen-schemas.ts — edite prisma/schema.base.prisma\n\n`;
  const datasource = `datasource db {\n  provider = "${provider}"\n}\n\n`;
  const body = base.replace(/output\s*=\s*"[^"]*"/, `output   = "${clientOutput(provider)}"`);
  return header + datasource + body;
}

function main() {
  const root = process.cwd();
  const base = readFileSync(join(root, "prisma", "schema.base.prisma"), "utf8");
  for (const provider of PROVIDERS) {
    const dir = join(root, "prisma", providerDir(provider));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "schema.prisma"), buildSchema(base, provider));
    console.log(`✔ prisma/${providerDir(provider)}/schema.prisma`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/gen-schemas.ts")) main();
