import { defaultLocale } from "@/i18n/config";
import { staticTranslator } from "@/i18n/static";

/** Chaves em messages/*.json (serverErrors.<chave>). */
export type ServerErrorKey =
  | "invalidUrl"
  | "privateNetwork"
  | "responseTooLarge"
  | "tooManyRedirects"
  | "httpStatus"
  | "connectFailed"
  | "feedRefreshing"
  | "ttsNotConfigured"
  | "ttsTimeout"
  | "ttsUnauthorized"
  | "ttsFailed"
  | "ttsInvalidWav"
  | "ttsEmptyWav"
  | "ttsEmptyAudio"
  | "ttsProviderNotFound"
  | "ttsInvalidFields"
  | "ttsAdminsOnly"
  | "ttsSourceUnavailable"
  | "noPermission"
  | "noTextToNarrate";

type Params = Record<string, string | number>;

/** Erro com mensagem traduzível pela chave; `message` fica em inglês para logs. */
export class LocalizedError extends Error {
  constructor(
    public readonly key: ServerErrorKey,
    public readonly params: Params = {},
  ) {
    super(staticTranslator("en", "serverErrors")(key, params));
    this.name = "LocalizedError";
  }
}

const STORED_PREFIX = "i18n:";

/** Texto para gravar no banco (ex.: feed.lastError), traduzido depois na exibição. */
export function serializeError(err: unknown): string {
  if (err instanceof LocalizedError) return `${STORED_PREFIX}${JSON.stringify({ key: err.key, params: err.params })}`;
  return err instanceof Error ? err.message : String(err);
}

/** Traduz um erro vivo ou um texto gravado por `serializeError`; textos antigos passam como estão. */
export function localizeError(err: unknown, locale: string = defaultLocale): string {
  const t = staticTranslator(locale, "serverErrors");
  if (err instanceof LocalizedError) return t(err.key, err.params);
  if (typeof err === "string") {
    if (!err.startsWith(STORED_PREFIX)) return err;
    try {
      const { key, params } = JSON.parse(err.slice(STORED_PREFIX.length)) as { key: ServerErrorKey; params?: Params };
      return t.has(key) ? t(key, params ?? {}) : err;
    } catch {
      return err;
    }
  }
  return err instanceof Error ? err.message : String(err);
}
