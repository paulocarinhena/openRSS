import "server-only";
import type { TtsProvider } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getUserSettings } from "@/lib/app-settings";
import { pinnedFetch } from "@/lib/network";

export const TTS_FORMATS = ["mp3", "opus", "aac", "flac", "wav", "pcm"] as const;
export const TTS_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"] as const;
const SPEECH_TIMEOUT_MS = 120_000;

export async function resolveTtsProvider(userId: string) {
  const settings = await getUserSettings(userId);
  const where = { enabled: true, OR: [{ userId }, { userId: null }] };
  const selected = settings.ttsProviderId
    ? await db.ttsProvider.findFirst({ where: { ...where, id: settings.ttsProviderId } })
    : null;
  const [personal, global] = selected
    ? [null, null]
    : await Promise.all([
        db.ttsProvider.findFirst({ where: { enabled: true, userId }, orderBy: { createdAt: "asc" } }),
        db.ttsProvider.findFirst({ where: { enabled: true, userId: null }, orderBy: { createdAt: "asc" } }),
      ]);
  const provider = selected ?? personal ?? global;
  if (!provider) throw new Error("Nenhum provedor de áudio configurado. Configure em Configurações → IA.");
  return provider;
}

export async function requestSpeech(provider: TtsProvider, input: string, signal?: AbortSignal) {
  const base = provider.baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.apiKeyEncrypted) headers.authorization = `Bearer ${decrypt(provider.apiKeyEncrypted)}`;
  let connection: Awaited<ReturnType<typeof pinnedFetch>>;
  try {
    connection = await pinnedFetch(
      `${base}/audio/speech`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ model: provider.model, voice: provider.voice, input, response_format: provider.responseFormat }),
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(SPEECH_TIMEOUT_MS)]) : AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      },
      provider.userId === null,
    );
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("O provedor de áudio demorou mais de dois minutos para responder. Tente novamente.");
    }
    throw error;
  }
  try {
    const response = connection.response;
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(response.status === 401 || response.status === 403
        ? "API key de áudio inválida ou sem permissão."
        : `Falha ao gerar áudio (HTTP ${response.status})${detail ? `: ${detail}` : ""}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    await connection.close();
  }
}

/** Junta segmentos de áudio; WAV precisa de um único cabeçalho e tamanhos recalculados. */
export function mergeAudioParts(parts: Uint8Array[], format: string): Uint8Array<ArrayBuffer> {
  if (parts.length === 1) {
    const copy = new Uint8Array(parts[0].byteLength);
    copy.set(parts[0]);
    return copy;
  }
  if (format !== "wav") {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.byteLength;
    }
    return output;
  }

  const parsed = parts.map((part) => {
    const view = new DataView(part.buffer, part.byteOffset, part.byteLength);
    if (part.byteLength < 44 || readAscii(part, 0, 4) !== "RIFF" || readAscii(part, 8, 4) !== "WAVE") {
      throw new Error("O provedor retornou um segmento WAV inválido.");
    }
    let offset = 12;
    while (offset + 8 <= part.byteLength) {
      const id = readAscii(part, offset, 4);
      const size = view.getUint32(offset + 4, true);
      if (id === "data" && offset + 8 + size <= part.byteLength) {
        return { part, dataOffset: offset + 8, dataSize: size, sizeOffset: offset + 4 };
      }
      offset += 8 + size + (size % 2);
    }
    throw new Error("O segmento WAV não contém dados de áudio.");
  });
  const first = parsed[0];
  const totalData = parsed.reduce((sum, item) => sum + item.dataSize, 0);
  const output = new Uint8Array(first.dataOffset + totalData);
  output.set(first.part.subarray(0, first.dataOffset));
  let cursor = first.dataOffset;
  for (const item of parsed) {
    output.set(item.part.subarray(item.dataOffset, item.dataOffset + item.dataSize), cursor);
    cursor += item.dataSize;
  }
  const outputView = new DataView(output.buffer);
  outputView.setUint32(4, output.byteLength - 8, true);
  outputView.setUint32(first.sizeOffset, totalData, true);
  return output;
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export const ttsMimeType = (format: string) => ({
  mp3: "audio/mpeg", opus: "audio/ogg", aac: "audio/aac", flac: "audio/flac", wav: "audio/wav", pcm: "audio/L16",
})[format] ?? "application/octet-stream";
