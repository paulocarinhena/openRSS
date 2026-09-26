"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { generateText } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireAdmin, requireUser } from "@/lib/session";
import { createModel, listModels, listModelsFor, PROVIDER_TYPES } from "@/lib/ai/providers";
import { errorMessage } from "@/lib/ai/content";
import { generateDigest } from "@/lib/ai/digest";
import { classifyForUser } from "@/lib/ai/classify";
import { actionErrorMessage } from "@/lib/action-errors";

// Mensagens do zod são chaves de ai.actionErrors (traduzidas por actionErrorMessage).
const providerSchema = z.object({
  id: z.string().optional(),
  scope: z.enum(["user", "global"]),
  type: z.enum(PROVIDER_TYPES),
  name: z.string().trim().min(1, "nameRequired").max(60),
  baseUrl: z.union([z.url("invalidBaseUrl"), z.literal("")]).optional(),
  apiKey: z.string().optional(), // vazio = manter a atual
  defaultModel: z.string().trim().max(200).optional(),
  enabled: z.boolean().default(true),
});

/** Erro de validação/permissão desta camada; `errorMessage` traduz pela chave. */
class ProviderActionError extends Error {
  constructor(public readonly key: "providerNotFound" | "noPermission") {
    super(key);
  }
}

async function failed(err: unknown) {
  if (err instanceof ProviderActionError) {
    const t = await getTranslations("ai.actionErrors");
    return { ok: false as const, error: t(err.key) };
  }
  return { ok: false as const, error: errorMessage(err, await getLocale()) };
}

/** Garante que o usuário pode editar o provedor (dono, ou admin para globais). */
async function editableProvider(id: string) {
  const user = await requireUser();
  const provider = await db.aiProvider.findUnique({ where: { id } });
  if (!provider) throw new ProviderActionError("providerNotFound");
  const canEdit = provider.userId ? provider.userId === user.id : user.role === "admin";
  if (!canEdit) throw new ProviderActionError("noPermission");
  return { user, provider };
}

export async function saveProviderAction(input: z.input<typeof providerSchema>) {
  const user = await requireUser();
  const t = await getTranslations("ai.actionErrors");
  const parsed = providerSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: actionErrorMessage(t, parsed.error) };
  const { id, scope, apiKey, baseUrl, defaultModel, ...rest } = parsed.data;

  if (scope === "global" && user.role !== "admin") return { ok: false as const, error: t("adminsOnly") };
  if (rest.type === "openai_compatible" && !baseUrl) return { ok: false as const, error: t("baseUrlRequired") };

  const data = {
    ...rest,
    baseUrl: baseUrl || null,
    defaultModel: defaultModel || null,
    ...(apiKey ? { apiKeyEncrypted: encrypt(apiKey.trim()) } : {}),
  };

  try {
    if (id) {
      const { provider } = await editableProvider(id);
      // A chave salva só vai para o destino em que foi cadastrada: trocar tipo ou Base URL exige informar a chave de novo.
      const sameTarget = provider.type === data.type && (provider.baseUrl ?? null) === data.baseUrl;
      const keepsKey = "apiKeyEncrypted" in data || sameTarget;
      await db.$transaction([
        db.aiProvider.update({ where: { id }, data: keepsKey ? data : { ...data, apiKeyEncrypted: null } }),
        db.articleSummary.deleteMany({ where: { providerId: id } }),
      ]);
    } else {
      await db.aiProvider.create({ data: { ...data, userId: scope === "user" ? user.id : null } });
    }
  } catch (err) {
    return failed(err);
  }
  revalidatePath("/settings", "layout");
  return { ok: true as const };
}

export async function deleteProviderAction(id: string) {
  try {
    await editableProvider(id);
    await db.$transaction([
      db.articleSummary.deleteMany({ where: { providerId: id } }),
      db.aiProvider.delete({ where: { id } }),
      db.userSettings.updateMany({ where: { aiProviderId: id }, data: { aiProviderId: null, aiModel: null } }),
      db.appSettings.updateMany({ where: { defaultAiProviderId: id }, data: { defaultAiProviderId: null, defaultAiModel: null } }),
    ]);
  } catch (err) {
    return failed(err);
  }
  revalidatePath("/settings", "layout");
  return { ok: true as const };
}

/** Marca um provedor/modelo já cadastrado como padrão do sistema (usado por quem não tem preferência própria). */
export async function setSystemDefaultAction(providerId: string, model: string) {
  const admin = await requireAdmin();
  const t = await getTranslations("ai.actionErrors");
  const trimmedModel = model.trim();
  if (!trimmedModel) return { ok: false as const, error: t("modelRequired") };

  const provider = await db.aiProvider.findUnique({ where: { id: providerId } });
  if (!provider) return { ok: false as const, error: t("providerNotFound") };
  // Promover um provedor pessoal o torna global e compartilha a chave dele: só o próprio dono pode fazer isso.
  if (provider.userId && provider.userId !== admin.id) return { ok: false as const, error: t("foreignProviderDefault") };

  try {
    await db.$transaction([
      ...(provider.userId
        ? [db.aiProvider.update({ where: { id: providerId }, data: { userId: null } })]
        : []),
      db.appSettings.upsert({
        where: { id: "app" },
        create: { id: "app", defaultAiProviderId: providerId, defaultAiModel: trimmedModel },
        update: { defaultAiProviderId: providerId, defaultAiModel: trimmedModel },
      }),
    ]);
  } catch (err) {
    return failed(err);
  }
  revalidatePath("/settings", "layout");
  return { ok: true as const };
}

/** Remove o padrão de sistema (o fallback volta a ser o primeiro provedor disponível). */
export async function clearSystemDefaultAction() {
  await requireAdmin();
  await db.appSettings.upsert({
    where: { id: "app" },
    create: { id: "app", defaultAiProviderId: null, defaultAiModel: null },
    update: { defaultAiProviderId: null, defaultAiModel: null },
  });
  revalidatePath("/settings", "layout");
  return { ok: true as const };
}

async function usableProvider(id: string) {
  const user = await requireUser();
  const provider = await db.aiProvider.findFirst({ where: { id, OR: [{ userId: user.id }, { userId: null }] } });
  if (!provider) throw new ProviderActionError("providerNotFound");
  return provider;
}

export async function testProviderAction(id: string, model?: string) {
  try {
    const provider = await usableProvider(id);
    const modelId = model || provider.defaultModel;
    if (!modelId) {
      const t = await getTranslations("ai.actionErrors");
      return { ok: false as const, error: t("modelRequired") };
    }
    const started = Date.now();
    const { text } = await generateText({
      model: createModel(provider, modelId),
      prompt: "Responda apenas com a palavra: ok",
      maxOutputTokens: 16,
    });
    return { ok: true as const, reply: text.trim().slice(0, 60), ms: Date.now() - started };
  } catch (err) {
    return failed(err);
  }
}

/**
 * Lista modelos com os dados do formulário antes de salvar. Em edições, tipo e URL
 * sempre vêm do registro autorizado; a chave salva só pode ir para esse destino.
 */
export async function fetchModelsAction(input: { providerId?: string; type: string; baseUrl?: string; apiKey?: string }) {
  const user = await requireUser();
  const t = await getTranslations("ai.actionErrors");
  const type = z.enum(PROVIDER_TYPES).safeParse(input.type);
  if (!type.success) return { ok: false as const, error: t("invalidProviderType") };

  let apiKey = input.apiKey?.trim() || undefined;
  let providerType = type.data;
  let baseUrl = input.baseUrl;
  let allowPrivateNetwork = false;
  if (input.providerId) {
    const stored = await db.aiProvider.findFirst({ where: { id: input.providerId, OR: [{ userId: user.id }, { userId: null }] } });
    if (!stored) return { ok: false as const, error: t("providerNotFound") };
    const storedType = z.enum(PROVIDER_TYPES).safeParse(stored.type);
    if (!storedType.success) return { ok: false as const, error: t("invalidProviderType") };
    providerType = storedType.data;
    baseUrl = stored.baseUrl ?? undefined;
    allowPrivateNetwork = stored.type === "openai_compatible" && stored.userId === null;
    if (!apiKey && stored.apiKeyEncrypted) apiKey = decrypt(stored.apiKeyEncrypted);
  }
  if (!apiKey && providerType !== "openai_compatible" && providerType !== "openrouter") {
    return { ok: false as const, error: t("apiKeyRequiredForModels") };
  }
  if (providerType === "openai_compatible" && !baseUrl) {
    return { ok: false as const, error: t("baseUrlRequiredForModels") };
  }
  try {
    return { ok: true as const, models: await listModelsFor(providerType, baseUrl, apiKey, { allowPrivateNetwork }) };
  } catch (err) {
    return failed(err);
  }
}

export async function listModelsAction(id: string) {
  try {
    const provider = await usableProvider(id);
    return { ok: true as const, models: await listModels(provider) };
  } catch (err) {
    return failed(err);
  }
}

export async function generateDigestAction() {
  const user = await requireUser();
  let digest;
  try {
    digest = await generateDigest(user.id);
  } catch (err) {
    return failed(err);
  }
  revalidatePath("/digest");
  return { ok: true as const, id: digest.id };
}

/** Classifica os não lidos recentes (botão manual em Configurações). */
export async function classifyRecentAction() {
  const user = await requireUser();
  const recent = await db.article.findMany({
    where: {
      feed: { subscriptions: { some: { userId: user.id } } },
      publishedAt: { gte: new Date(Date.now() - 3 * 86400000) },
      NOT: { states: { some: { userId: user.id, OR: [{ isRead: true }, { classifiedAt: { not: null } }] } } },
    },
    select: { id: true },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });
  try {
    const count = await classifyForUser(user.id, recent.map((a) => a.id));
    revalidatePath("/", "layout");
    return { ok: true as const, count };
  } catch (err) {
    return failed(err);
  }
}
