import { stripHtml, truncate } from "@/lib/utils";
import { defaultLocale } from "@/i18n/config";
import { staticTranslator } from "@/i18n/static";
import { AiError } from "./errors";

type ArticleContentSource = { contentHtml?: string | null; fullContentHtml?: string | null; snippet?: string | null };

/** Fonte de conteúdo priorizada: HTML completo extraído > HTML do feed > snippet. */
const rawContentHtml = (a: ArticleContentSource) => a.fullContentHtml ?? a.contentHtml ?? a.snippet ?? "";

/** ~4 chars por token; limita o conteúdo enviado ao modelo. */
export function articleText(
  a: ArticleContentSource & { title: string; url?: string | null; author?: string | null },
  maxChars = 24000,
) {
  const body = stripHtml(rawContentHtml(a));
  const header = [`Título: ${a.title}`, a.author && `Autor: ${a.author}`, a.url && `URL: ${a.url}`].filter(Boolean);
  return [...header, "", truncate(body, maxChars)].join("\n");
}

/** HTML do artigo (sem cortar tags no meio), para traduções que devem preservar a formatação original. */
export function articleHtml(a: ArticleContentSource, maxChars = 20000) {
  const html = rawContentHtml(a);
  if (html.length <= maxChars) return html;
  const cut = html.lastIndexOf(">", maxChars);
  return cut > 0 ? html.slice(0, cut + 1) : html.slice(0, maxChars);
}

export const languageName = (code: string) =>
  ({ "pt-BR": "português do Brasil", en: "English", es: "español" })[code] ?? code;

/**
 * Instrução de idioma reforçada: o modelo tende a "espelhar" o idioma do
 * artigo-fonte e ignorar uma instrução simples, então repetimos o requisito
 * e deixamos explícito que o idioma do artigo não deve influenciar a resposta.
 */
export const languageInstruction = (code: string) => {
  const name = languageName(code);
  return `IMPORTANTE: responda somente em ${name}, do início ao fim, mesmo que o artigo ou os trechos fornecidos estejam em outro idioma. Nunca copie ou troque para o idioma do texto-fonte.`;
};

/** Mensagem legível para o usuário no idioma da interface (padrão pt-BR para logs). */
export function errorMessage(err: unknown, locale: string = defaultLocale): string {
  const t = staticTranslator(locale, "ai.errors");
  if (err instanceof AiError) return t(err.key, err.params);
  if (err instanceof Error) {
    const withData = err as Error & { responseBody?: string; statusCode?: number };
    if (withData.statusCode === 401) return t("apiKeyInvalid");
    if (withData.statusCode === 404) return t("modelNotFound");
    if (withData.statusCode === 429) return t("rateLimited");
    return err.message;
  }
  return String(err);
}
