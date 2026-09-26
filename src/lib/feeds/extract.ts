import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { safeFetch } from "./net";
import { extractPreviewImage } from "./preview-image";
import { sanitizeArticleHtml } from "./sanitize";

export type ExtractedPage = {
  /** URL final, depois dos redirecionamentos. */
  url: string;
  title: string | null;
  /** HTML saneado do conteúdo principal, ou null se o Readability não achou texto. */
  html: string | null;
  excerpt: string | null;
  byline: string | null;
  siteName: string | null;
  imageUrl: string | null;
};

/** Baixa a página e extrai o conteúdo principal (modo leitura) e os metadados. */
export async function extractPage(url: string): Promise<ExtractedPage> {
  const res = await safeFetch(url, { accept: "text/html,application/xhtml+xml" });
  const { document } = parseHTML(res.body);
  const pageTitle = document.querySelector("title")?.textContent?.trim() || null;
  const base = document.createElement("base");
  base.setAttribute("href", res.url);
  document.head?.appendChild(base);

  const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  return {
    url: res.url,
    title: article?.title?.trim() || pageTitle,
    html: article?.content ? sanitizeArticleHtml(article.content, res.url) : null,
    excerpt: article?.excerpt?.trim() || null,
    byline: article?.byline?.trim() || null,
    siteName: article?.siteName?.trim() || null,
    imageUrl: extractPreviewImage(res.body, res.url),
  };
}

/** Baixa a página original e extrai o conteúdo principal (modo leitura). */
export async function extractFullContent(url: string): Promise<string | null> {
  return (await extractPage(url)).html;
}
