import { validateRuntimeEnvironment } from "@/lib/env";

export async function registerNodeRuntime() {
  try {
    validateRuntimeEnvironment();
  } catch (error) {
    console.error(`Configuração de runtime inválida: ${(error as Error).message}`);
    process.exit(1);
  }

  if (process.env.DISABLE_SCHEDULER === "true") return;
  const { startScheduler } = await import("@/lib/jobs/scheduler");
  await startScheduler();
}
