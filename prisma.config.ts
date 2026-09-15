import "dotenv/config";
import { defineConfig } from "prisma/config";
import { readDatabaseUrl, resolveDatabaseConfig } from "./src/lib/env";

// Prisma generate also runs before the first-run setup creates config.json.
const database = resolveDatabaseConfig();
const provider = database?.provider ?? "sqlite";
const dir = provider === "postgresql" ? "postgres" : "sqlite";
const url = database?.url ?? readDatabaseUrl(provider);

export default defineConfig({
  schema: `prisma/${dir}/schema.prisma`,
  migrations: { path: `prisma/${dir}/migrations` },
  datasource: {
    url,
  },
});
