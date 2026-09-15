import "server-only";
import { Cron } from "croner";
import { tuneDatabase } from "@/lib/db";
import { applyRetention, refreshDueFeeds } from "@/lib/feeds/refresh";
import { classifyNewArticles } from "@/lib/ai/classify";
import { runScheduledDigests } from "@/lib/ai/digest";
import { withLock } from "./lock";

const globalForJobs = globalThis as unknown as { openrssJobs?: Cron[] };

export async function startScheduler() {
  if (globalForJobs.openrssJobs) return;
  await tuneDatabase().catch((err) => console.error("[jobs] tuneDatabase", err));

  const log = (name: string) => (err: unknown) => console.error(`[jobs:${name}]`, err);

  globalForJobs.openrssJobs = [
    new Cron("* * * * *", { protect: true }, async () => {
      await withLock("refresh", 10 * 60_000, async () => {
        const created = await refreshDueFeeds();
        if (created.length) {
          console.log(`[jobs:refresh] ${created.length} artigos novos`);
          await classifyNewArticles(created).catch(log("classify"));
        }
      }).catch(log("refresh"));
    }),
    new Cron("5 * * * *", { protect: true }, async () => {
      await withLock("digest", 30 * 60_000, () => runScheduledDigests()).catch(log("digest"));
    }),
    new Cron("30 3 * * *", { protect: true }, async () => {
      await withLock("retention", 30 * 60_000, async () => {
        const removed = await applyRetention();
        if (removed) console.log(`[jobs:retention] ${removed} artigos removidos`);
      }).catch(log("retention"));
    }),
  ];
  console.log("[jobs] agendador iniciado");
}
