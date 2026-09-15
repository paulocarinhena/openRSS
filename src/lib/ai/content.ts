import { stripHtml, truncate } from "@/lib/utils";

/** ~4 chars por token; limita o conteúdo enviado ao modelo. */
export function articleText(
  a: { title: string; url?: string | null; author?: string | null; contentHtml?: string | null; fullContentHtml?: string | null; snippet?: string | null },
  maxChars = 24000,
) {
  const body = stripHtml(a.fullContentHtml ?? a.contentHtml ?? a.snippet ?? "");
  const header = [`Título: ${a.title}`, a.author && `Autor: ${a.author}`, a.url && `URL: ${a.url}`].filter(Boolean);
  return [...header, "", truncate(body, maxChars)].join("\n");
}

export const languageName = (code: string) =>
  ({ "pt-BR": "português do Brasil", en: "English", es: "español" })[code] ?? code;

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const withData = err as Error & { responseBody?: string; statusCode?: number };
    if (withData.statusCode === 401) return "Chave de API inválida ou sem permissão.";
    if (withData.statusCode === 404) return "Modelo não encontrado neste provedor.";
    if (withData.statusCode === 429) return "Limite de requisições do provedor atingido. Tente mais tarde.";
    return err.message;
  }
  return String(err);
}
