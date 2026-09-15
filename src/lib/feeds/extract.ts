import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { safeFetch } from "./net";
import { sanitizeArticleHtml } from "./sanitize";

/** Baixa a página original e extrai o conteúdo principal (modo leitura). */
export async function extractFullContent(url: string): Promise<string | null> {
  const res = await safeFetch(url, { accept: "text/html,application/xhtml+xml" });
  const { document } = parseHTML(res.body);
  const base = document.createElement("base");
  base.setAttribute("href", res.url);
  document.head?.appendChild(base);

  const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  if (!article?.content) return null;
  return sanitizeArticleHtml(article.content, res.url);
}
