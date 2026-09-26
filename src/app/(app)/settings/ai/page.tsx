import { db } from "@/lib/db";
import { getAppSettings, getUserSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/session";
import { PROVIDER_META } from "@/lib/ai/providers";
import { EMBEDDING_PROVIDER_TYPES, embeddingStatus } from "@/lib/ai/embeddings";
import { SemanticSearchSettings } from "./semantic-search-settings";
import { AiSettings, type ProviderRow, type TtsProviderRow } from "./ai-settings";

export default async function AiSettingsPage() {
  const user = await requireUser();
  const [providers, ttsProviders, settings, appSettings] = await Promise.all([
    db.aiProvider.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: [{ userId: "desc" }, { createdAt: "asc" }],
    }),
    db.ttsProvider.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: [{ userId: "desc" }, { createdAt: "asc" }],
    }),
    getUserSettings(user.id),
    getAppSettings(),
  ]);

  const rows: ProviderRow[] = providers.map((p) => ({
    id: p.id,
    scope: p.userId ? "user" : "global",
    type: p.type as ProviderRow["type"],
    name: p.name,
    baseUrl: p.baseUrl ?? "",
    defaultModel: p.defaultModel ?? "",
    enabled: p.enabled,
    hasKey: Boolean(p.apiKeyEncrypted),
    editable: p.userId ? true : user.role === "admin",
    isSystemDefault: p.id === appSettings.defaultAiProviderId,
  }));
  const ttsRows: TtsProviderRow[] = ttsProviders.map((p) => ({
    id: p.id,
    scope: p.userId ? "user" : "global",
    name: p.name,
    baseUrl: p.baseUrl,
    model: p.model,
    voice: p.voice,
    responseFormat: p.responseFormat,
    enabled: p.enabled,
    hasKey: Boolean(p.apiKeyEncrypted),
    editable: p.userId ? true : user.role === "admin",
  }));

  const isAdmin = user.role === "admin";
  const status = isAdmin ? await embeddingStatus() : null;

  return (
    <>
      <AiSettings
        providers={rows}
        ttsProviders={ttsRows}
        meta={PROVIDER_META}
        isAdmin={user.role === "admin"}
        systemDefaultModel={appSettings.defaultAiModel ?? ""}
        settings={{
          aiProviderId: settings.aiProviderId,
          aiModel: settings.aiModel ?? "",
          ttsProviderId: settings.ttsProviderId,
          interests: settings.interests ?? "",
          classifyEnabled: settings.classifyEnabled,
          digestEnabled: settings.digestEnabled,
          digestHour: settings.digestHour,
        }}
      />
      {isAdmin && (
        <SemanticSearchSettings
          providers={providers
            .filter((p) => p.userId === null && EMBEDDING_PROVIDER_TYPES.includes(p.type as (typeof EMBEDDING_PROVIDER_TYPES)[number]))
            .map((p) => ({ id: p.id, name: p.name, type: p.type }))}
          current={{ providerId: appSettings.embeddingProviderId, model: appSettings.embeddingModel ?? "" }}
          status={status}
        />
      )}
    </>
  );
}
