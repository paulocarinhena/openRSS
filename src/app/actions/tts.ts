"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/session";
import { requestSpeech, TTS_FORMATS } from "@/lib/ai/tts";

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
  if (!provider) throw new Error("Provedor de áudio não encontrado.");
  if (provider.userId !== user.id && !(provider.userId === null && user.role === "admin")) throw new Error("Sem permissão.");
  return { user, provider };
}

export async function saveTtsProviderAction(input: z.input<typeof schema>) {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Revise os campos do provedor de áudio." };
  const { id, sourceAiProviderId, scope, apiKey, ...rest } = parsed.data;
  if (scope === "global" && user.role !== "admin") return { ok: false as const, error: "Apenas administradores podem criar provedores globais." };
  try {
    const source = sourceAiProviderId
      ? await db.aiProvider.findFirst({
          where: { id: sourceAiProviderId, type: { in: ["openai", "openai_compatible"] }, OR: [{ userId: user.id }, { userId: null }] },
        })
      : null;
    if (sourceAiProviderId && !source) throw new Error("O provedor de IA selecionado não está disponível para TTS.");
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
      await editable(id);
      await db.ttsProvider.update({ where: { id }, data });
    } else {
      await db.ttsProvider.create({ data: { ...data, userId: scope === "user" ? user.id : null } });
    }
    revalidatePath("/settings", "layout");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
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
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function testTtsProviderAction(id: string) {
  try {
    const user = await requireUser();
    const provider = await db.ttsProvider.findFirst({ where: { id, OR: [{ userId: user.id }, { userId: null }] } });
    if (!provider) throw new Error("Provedor de áudio não encontrado.");
    const started = Date.now();
    const audio = await requestSpeech(provider, "Configuração de áudio concluída com sucesso.", AbortSignal.timeout(30_000));
    if (!audio.byteLength) throw new Error("O provedor retornou um áudio vazio.");
    return { ok: true as const, ms: Date.now() - started };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}
