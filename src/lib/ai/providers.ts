import "server-only";
import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AiProvider } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAppSettings, getUserSettings } from "@/lib/app-settings";
import { createPinnedWebFetch, pinnedFetch, resolveNetworkTarget } from "@/lib/network";
import { AiError, AiNotConfiguredError } from "./errors";

export { AiNotConfiguredError };

export const PROVIDER_TYPES = ["openai", "anthropic", "openrouter", "openai_compatible"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_META: Record<ProviderType, { label: string; defaultBaseUrl: string; needsBaseUrl: boolean; modelHint: string }> = {
  openai: { label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", needsBaseUrl: false, modelHint: "gpt-5-mini" },
  anthropic: { label: "Anthropic", defaultBaseUrl: "https://api.anthropic.com/v1", needsBaseUrl: false, modelHint: "claude-sonnet-5" },
  openrouter: { label: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1", needsBaseUrl: false, modelHint: "anthropic/claude-sonnet-5" },
  openai_compatible: { label: "OpenAI-compatible", defaultBaseUrl: "http://localhost:11434/v1", needsBaseUrl: true, modelHint: "llama3.2" },
};

function apiKeyOf(p: AiProvider): string | undefined {
  return p.apiKeyEncrypted ? decrypt(p.apiKeyEncrypted) : undefined;
}

export function createModel(p: AiProvider, modelId: string): LanguageModel {
  const apiKey = apiKeyOf(p);
  const baseURL = p.baseUrl || undefined;
  const fetch = createPinnedWebFetch(p.type === "openai_compatible" && p.userId === null);
  switch (p.type as ProviderType) {
    case "openai":
      return createOpenAI({ apiKey, baseURL, fetch })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey, baseURL, fetch })(modelId);
    case "openrouter":
      return createOpenRouter({ apiKey, baseURL, appName: "openRSS", fetch })(modelId);
    case "openai_compatible":
      if (!baseURL) throw new AiNotConfiguredError("providerNeedsBaseUrl", { name: p.name });
      return createOpenAICompatible({ name: "openai-compatible", baseURL, apiKey, fetch })(modelId);
    default:
      throw new AiNotConfiguredError("unknownProviderType", { type: p.type });
  }
}

/** Provedores que o usuário pode usar: os dele + os globais habilitados. */
export function availableProviders(userId: string) {
  return db.aiProvider.findMany({
    where: { enabled: true, OR: [{ userId }, { userId: null }] },
    orderBy: [{ userId: "desc" }, { createdAt: "asc" }],
  });
}

export type ResolvedModel = { model: LanguageModel; modelId: string; provider: AiProvider };

/**
 * Resolve o modelo: provider/model explícitos → preferências do usuário →
 * padrão do sistema definido pelo admin → primeiro provedor disponível
 * (do usuário, depois global) com defaultModel.
 */
export async function resolveModel(userId: string, opts: { providerId?: string; model?: string } = {}): Promise<ResolvedModel> {
  const settings = await getUserSettings(userId);
  const providers = await availableProviders(userId);
  if (providers.length === 0) throw new AiNotConfiguredError();
  const appSettings = await getAppSettings();

  const wantedId = opts.providerId ?? settings.aiProviderId ?? appSettings.defaultAiProviderId;
  const provider = providers.find((p) => p.id === wantedId) ?? providers[0];
  const modelId =
    opts.model ||
    (provider.id === settings.aiProviderId ? settings.aiModel : null) ||
    (provider.id === appSettings.defaultAiProviderId ? appSettings.defaultAiModel : null) ||
    provider.defaultModel;
  if (!modelId) throw new AiNotConfiguredError("noDefaultModel", { name: provider.name });

  return { model: createModel(provider, modelId), modelId, provider };
}

export type ModelInfo = { id: string; name?: string };

/** Valida o destino antes de qualquer requisição autenticada de listagem. */
export async function assertSafeModelListingUrl(baseUrl: string, allowPrivateNetwork = false): Promise<URL> {
  try {
    return (await resolveNetworkTarget(baseUrl, allowPrivateNetwork)).url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AiError(message.includes("rede privada") ? "privateNetworkBaseUrl" : "invalidListingBaseUrl");
  }
}

/** Lista modelos a partir de tipo/baseUrl/apiKey (permite listar antes de salvar o provedor). */
export async function listModelsFor(
  type: ProviderType,
  baseUrl: string | null | undefined,
  apiKey: string | undefined,
  options: { allowPrivateNetwork?: boolean } = {},
): Promise<ModelInfo[]> {
  const base = (baseUrl || PROVIDER_META[type].defaultBaseUrl).replace(/\/$/, "");
  const headers: Record<string, string> =
    type === "anthropic"
      ? { "x-api-key": apiKey ?? "", "anthropic-version": "2023-06-01" }
      : apiKey
        ? { authorization: `Bearer ${apiKey}` }
        : {};

  let connection: Awaited<ReturnType<typeof pinnedFetch>>;
  try {
    connection = await pinnedFetch(
      `${base}/models${type === "anthropic" ? "?limit=1000" : ""}`,
      { headers, redirect: "error", signal: AbortSignal.timeout(15000) },
      options.allowPrivateNetwork,
    );
  } catch (err) {
    throw new AiError("connectFailed", { base, reason: err instanceof Error ? err.message : String(err) });
  }
  let json: {
    data?: { id: string; name?: string; display_name?: string }[];
    models?: { id?: string; name?: string; model?: string }[];
  };
  try {
    const res = connection.response;
    if (res.status === 401 || res.status === 403) throw new AiError("listUnauthorized");
    if (!res.ok) throw new AiError("listFailed", { status: res.status });
    json = (await res.json()) as typeof json;
  } finally {
    await connection.close();
  }
  const raw = json.data ?? json.models ?? [];
  const byId = new Map<string, ModelInfo>();
  for (const m of raw) {
    const id = ("id" in m && m.id) || ("model" in m && m.model) || m.name;
    if (!id) continue;
    const name = ("display_name" in m && m.display_name) || m.name;
    byId.set(id, { id, name: name && name !== id ? name : undefined });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Lista modelos de um provedor salvo. */
export function listModels(p: AiProvider): Promise<ModelInfo[]> {
  const allowPrivateNetwork = p.type === "openai_compatible" && p.userId === null;
  return listModelsFor(p.type as ProviderType, p.baseUrl, apiKeyOf(p), { allowPrivateNetwork });
}
