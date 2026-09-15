import "server-only";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { DatabaseConfig } from "@/lib/env";

const PRISMA_CLI = join("node_modules", "prisma", "build", "index.js");

/**
 * Aplica as migrations do provider escolhido via `prisma migrate deploy`.
 * As variáveis passadas por env têm precedência no prisma.config.ts, então o
 * subprocesso migra exatamente o banco informado, mesmo antes do config.json existir.
 */
export function runMigrations({ provider, url }: DatabaseConfig) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PROVIDER: provider, DATABASE_URL: url },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const tail = output.trim().split("\n").slice(-15).join("\n");
      reject(new Error(`prisma migrate deploy falhou (código ${code}):\n${tail}`));
    });
  });
}
