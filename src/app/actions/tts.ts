"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/session";
import { requestSpeech, TTS_FORMATS } from "@/lib/ai/tts";
import { LocalizedError, localizeError } from "@/lib/localized-error";

const failed = async (error: unknown) => ({ ok: false as const, error: localizeError(error, await getLocale()) });

const schema = z.object({
  id: z.string().optional(),
  sourceAiProviderId: z.string().optional(),
  scope: z.enum(["user", "global"]),
  name: z.string().trim().min(1).max(60),
  baseUrl: z.url(),
  apiKey: z.string().optional(),
  model: z.string().trim().min(1).max(200),
  voice: z.string().trim().min(1).max(100),
  responseFormat: z.enum(TTS_FORMATS),
  enabled: z.boolean(),
});

async function editable(id: string) {
  const user = await requireUser();
  const provider = await db.ttsProvider.findUnique({ where: { id } });
  if (!provider) throw new LocalizedError("ttsProviderNotFound");
  if (provider.userId !== user.id && !(provider.userId === null && user.role === "admin")) throw new LocalizedError("noPermission");
  return { user, provider };
}

export async function saveTtsProviderAction(input: z.input<typeof schema>) {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failed(new LocalizedError("ttsInvalidFields"));
  const { id, sourceAiProviderId, scope, apiKey, ...rest } = parsed.data;
  if (scope === "global" && user.role !== "admin") return failed(new LocalizedError("ttsAdminsOnly"));
  try {
    const source = sourceAiProviderId
      ? await db.aiProvider.findFirst({
          where: { id: sourceAiProviderId, type: { in: ["openai", "openai_compatible"] }, OR: [{ userId: user.id }, { userId: null }] },
        })
      : null;
    if (sourceAiProviderId && !source) throw new LocalizedError("ttsSourceUnavailable");
    const data = {
      ...rest,
      baseUrl: (source?.baseUrl || (source?.type === "openai" ? "https://api.openai.com/v1" : rest.baseUrl)).replace(/\/$/, ""),
      ...(source?.apiKeyEncrypted
        ? { apiKeyEncrypted: source.apiKeyEncrypted }
        : apiKey?.trim()
          ? { apiKeyEncrypted: encrypt(apiKey.trim()) }
          : {}),
    };
    if (id) {
      const { provider } = await editable(id);
      // A chave salva só vai para o destino em que foi cadastrada: trocar a Base URL exige informar a chave de novo.
      const keepsKey = "apiKeyEncrypted" in data || provider.baseUrl.replace(/\/$/, "") === data.baseUrl;
      await db.ttsProvider.update({ where: { id }, data: keepsKey ? data : { ...data, apiKeyEncrypted: null } });
    } else {
      await db.ttsProvider.create({ data: { ...data, userId: scope === "user" ? user.id : null } });
    }
    revalidatePath("/settings", "layout");
    return { ok: true as const };
  } catch (error) {
    return failed(error);
  }
}

export async function deleteTtsProviderAction(id: string) {
  try {
    await editable(id);
    await db.$transaction([
      db.ttsProvider.delete({ where: { id } }),
      db.userSettings.updateMany({ where: { ttsProviderId: id }, data: { ttsProviderId: null } }),
    ]);
    revalidatePath("/settings", "layout");
    return { ok: true as const };
  } catch (error) {
    return failed(error);
  }
}

export async function testTtsProviderAction(id: string) {
  try {
    const user = await requireUser();
    const provider = await db.ttsProvider.findFirst({ where: { id, OR: [{ userId: user.id }, { userId: null }] } });
    if (!provider) throw new LocalizedError("ttsProviderNotFound");
    const started = Date.now();
    const audio = await requestSpeech(provider, "Configuração de áudio concluída com sucesso.", AbortSignal.timeout(30_000));
    if (!audio.byteLength) throw new LocalizedError("ttsEmptyAudio");
    return { ok: true as const, ms: Date.now() - started };
  } catch (error) {
    return failed(error);
  }
}
