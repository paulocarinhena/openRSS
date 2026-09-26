import "server-only";
import { classifyNewArticles } from "@/lib/ai/classify";
import { applyRulesToArticles } from "@/lib/rules/apply";
import { serializeError } from "@/lib/localized-error";

/** Pós-processamento de artigos novos: regras de texto → classificação por IA (que aplica as regras com nota). */
export async function processNewArticles(articleIds: string[]) {
  if (articleIds.length === 0) return;
  await applyRulesToArticles(articleIds, "ingest").catch((err) => console.error("[rules]", serializeError(err)));
  await classifyNewArticles(articleIds).catch((err) => console.error("[classify]", serializeError(err)));
}
