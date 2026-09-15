import "dotenv/config";
import { defineConfig } from "prisma/config";
import { readDatabaseProvider, readDatabaseUrl } from "./src/lib/env";

const provider = readDatabaseProvider();
const dir = provider === "postgresql" ? "postgres" : "sqlite";
const url = readDatabaseUrl(provider);

export default defineConfig({
  schema: `prisma/${dir}/schema.prisma`,
  migrations: { path: `prisma/${dir}/migrations` },
  datasource: {
    url,
  },
});
