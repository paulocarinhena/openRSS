import { createTranslator, type Messages, type NamespaceKeys, type NestedKeyOf } from "next-intl";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import ptBR from "../../messages/pt-BR.json";
import { defaultLocale, isLocale, type Locale } from "./config";

export const messagesByLocale: Record<Locale, Messages> = { "pt-BR": ptBR, en, es };

/**
 * Tradutor para contextos sem requisição (scheduler, hooks do better-auth).
 * Locales desconhecidos caem no padrão.
 */
export function staticTranslator<NestedKey extends NamespaceKeys<Messages, NestedKeyOf<Messages>> = never>(
  locale: string,
  namespace?: NestedKey,
) {
  const resolved = isLocale(locale) ? locale : defaultLocale;
  return createTranslator<Messages, NestedKey>({ locale: resolved, messages: messagesByLocale[resolved], namespace });
}
