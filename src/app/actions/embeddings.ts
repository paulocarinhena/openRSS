"use server";

import { embed } from "ai";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { errorMessage } from "@/lib/ai/content";
import { createEmbeddingModel, embedPending, EMBEDDING_PROVIDER_TYPES } from "@/lib/ai/embeddings";
import type { ProviderType } from "@/lib/ai/providers";

/**
 * Liga (provedor global + modelo) ou desliga a busca semântica. Antes de salvar, calcula um
 * embedding de teste para confirmar que o provedor responde; a indexação começa em seguida.
 */
export async function setEmbeddingConfigAction(input: { providerId: string | null; model: string }) {
  await requireAdmin();
  const t = await getTranslations("semantic.errors");
  if (!input.providerId) {
    await db.appSettings.upsert({ where: { id: "app" }, create: { id: "app" }, update: { embeddingProviderId: null, embeddingModel: null } });
    revalidatePath("/settings/ai");
    return { ok: true as const };
  }
  const model = z.string().trim().min(1).max(200).safeParse(input.model);
  if (!model.success) return { ok: false as const, error: t("modelRequired") };
  const provider = await db.aiProvider.findFirst({ where: { id: input.providerId, userId: null } });
  if (!provider || !EMBEDDING_PROVIDER_TYPES.includes(provider.type as ProviderType)) return { ok: false as const, error: t("providerInvalid") };

  try {
    const { embedding } = await embed({ model: createEmbeddingModel(provider, model.data), value: "openRSS", maxRetries: 0 });
    if (!embedding.length) throw new Error(t("emptyVector"));
  } catch (err) {
    return { ok: false as const, error: t("testFailed", { reason: errorMessage(err, await getLocale()) }) };
  }

  await db.appSettings.upsert({
    where: { id: "app" },
    create: { id: "app", embeddingProviderId: provider.id, embeddingModel: model.data },
    update: { embeddingProviderId: provider.id, embeddingModel: model.data },
  });
  void embedPending().catch((err) => console.error("[embeddings]", err));
  revalidatePath("/settings/ai");
  return { ok: true as const };
}
