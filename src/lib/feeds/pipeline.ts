import "server-only";
import { classifyNewArticles } from "@/lib/ai/classify";
import { applyRulesToArticles } from "@/lib/rules/apply";
import { serializeError } from "@/lib/localized-error";
import { embedArticles, embedPending } from "@/lib/ai/embeddings";

/** Pós-processamento de artigos novos: regras de texto → classificação por IA (que aplica as regras com nota). */
export async function processNewArticles(articleIds: string[]) {
  if (articleIds.length === 0) return;
  await applyRulesToArticles(articleIds, "ingest").catch((err) => console.error("[rules]", serializeError(err)));
  await classifyNewArticles(articleIds).catch((err) => console.error("[classify]", serializeError(err)));
  await embedArticles(articleIds).catch((err) => console.error("[embeddings]", serializeError(err)));
}

/** Indexação gradual para a busca semântica (artigos anteriores à configuração ou que falharam). */
export async function indexPendingEmbeddings() {
  await embedPending().catch((err) => console.error("[embeddings]", serializeError(err)));
}
