export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Não roda durante `next build`.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { registerNodeRuntime } = await import("./instrumentation-node");
  await registerNodeRuntime();
}
