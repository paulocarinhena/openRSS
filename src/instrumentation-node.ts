import { resolveRuntimeConfig, setupToken } from "@/lib/env";

export async function registerNodeRuntime() {
  let database: ReturnType<typeof resolveRuntimeConfig>["database"];
  try {
    // Também gera e persiste o APP_SECRET quando ele não vem do ambiente.
    ({ database } = resolveRuntimeConfig());
  } catch (error) {
    console.error(`Configuração de runtime inválida: ${(error as Error).message}`);
    process.exit(1);
  }

  if (!database) {
    console.log("openRSS: configuração inicial pendente — acesse /setup no navegador.");
    console.log(`openRSS: token de instalação: ${setupToken()}`);
    return;
  }

  try {
    console.log(`openRSS: aplicando migrations (${database.provider})...`);
    const { runMigrations } = await import("@/lib/setup/migrate");
    await runMigrations(database);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  if (process.env.DISABLE_SCHEDULER === "true") return;
  const { startScheduler } = await import("@/lib/jobs/scheduler");
  await startScheduler();
}
