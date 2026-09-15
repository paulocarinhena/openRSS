/** Chaves em messages/*.json (ai.errors.<chave>). */
export type AiErrorKey =
  | "notConfigured"
  | "providerNeedsBaseUrl"
  | "unknownProviderType"
  | "noDefaultModel"
  | "privateNetworkBaseUrl"
  | "invalidListingBaseUrl"
  | "connectFailed"
  | "listUnauthorized"
  | "listFailed"
  | "digestInProgress"
  | "apiKeyInvalid"
  | "modelNotFound"
  | "rateLimited";

/** Erro de IA com mensagem traduzível: `errorMessage(err, locale)` resolve o texto. */
export class AiError extends Error {
  constructor(
    public readonly key: AiErrorKey,
    public readonly params: Record<string, string | number> = {},
  ) {
    super(key);
    this.name = "AiError";
  }
}

export class AiNotConfiguredError extends AiError {
  constructor(key: AiErrorKey = "notConfigured", params: Record<string, string | number> = {}) {
    super(key, params);
    this.name = "AiNotConfiguredError";
  }
}
