import { db } from "@/lib/db";
import { getUserSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/session";
import { PROVIDER_META } from "@/lib/ai/providers";
import { AiSettings, type ProviderRow } from "./ai-settings";

export default async function AiSettingsPage() {
  const user = await requireUser();
  const [providers, settings] = await Promise.all([
    db.aiProvider.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: [{ userId: "desc" }, { createdAt: "asc" }],
    }),
    getUserSettings(user.id),
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
  }));

  return (
    <AiSettings
      providers={rows}
      meta={PROVIDER_META}
      isAdmin={user.role === "admin"}
      settings={{
        aiProviderId: settings.aiProviderId,
        aiModel: settings.aiModel ?? "",
        interests: settings.interests ?? "",
        classifyEnabled: settings.classifyEnabled,
        digestEnabled: settings.digestEnabled,
        digestHour: settings.digestHour,
      }}
    />
  );
}
