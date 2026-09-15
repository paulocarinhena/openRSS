import type { ZodError } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any -- aceita qualquer tradutor tipado do next-intl */
type TranslatorLike = { (key: any, values?: any): string; has(key: any): boolean };
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Traduz o primeiro erro de um schema zod cujas mensagens são chaves do namespace de `t`.
 * Cai em `invalidData` (do mesmo namespace) quando a mensagem não é uma chave conhecida.
 */
export function actionErrorMessage(t: TranslatorLike, error: ZodError): string {
  const key = error.issues[0]?.message;
  if (key && t.has(key)) return t(key);
  return t("invalidData");
}
