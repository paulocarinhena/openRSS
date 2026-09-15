import "server-only";
import { getUserSettings } from "@/lib/app-settings";
import { availableProviders } from "@/lib/ai/providers";

/** Provedores e padrões de modelo usados pelo compositor do chat. */
export async function getChatModelData(userId: string) {
  const [providers, settings] = await Promise.all([availableProviders(userId), getUserSettings(userId)]);
  return {
    providers: providers.map((p) => ({ id: p.id, name: p.name, type: p.type, defaultModel: p.defaultModel })),
    defaults: { providerId: settings.aiProviderId, model: settings.aiModel ?? "" },
  };
}
