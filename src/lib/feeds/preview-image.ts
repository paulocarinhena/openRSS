import "server-only";
import { safeFetch } from "./net";

const PRIORITY = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"];

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4]) : undefined;
}

/** One pass. Chained replaces turn `&amp;quot;` into `"`. */
const decodeEntities = (value: string) =>
  value.replace(/&(?:amp|quot|#39|#(?:x|X)2(?:f|F));/g, (entity) => {
    switch (entity.toLowerCase()) {
      case "&amp;":
        return "&";
      case "&quot;":
        return '"';
      case "&#39;":
        return "'";
      default:
        return "/";
    }
  });

/** Extrai a imagem de capa (og:image / twitter:image / image_src) do HTML de uma página. */
export function extractPreviewImage(html: string, pageUrl: string): string | null {
  const head = html.slice(0, 300_000);
  const found = new Map<string, string>();

  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && PRIORITY.includes(key) && !found.has(key)) found.set(key, content);
  }
  const linkTag = /<link\b[^>]*rel\s*=\s*["']?image_src["']?[^>]*>/i.exec(head)?.[0];
  const linkHref = linkTag ? attr(linkTag, "href") : undefined;

  const candidate = PRIORITY.map((k) => found.get(k)).find(Boolean) ?? linkHref;
  if (!candidate) return null;
  try {
    const url = new URL(decodeEntities(candidate.trim()), pageUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Busca a página original e retorna a imagem de capa, ou null. */
export async function findPreviewImage(pageUrl: string): Promise<string | null> {
  const res = await safeFetch(pageUrl, { accept: "text/html,application/xhtml+xml", timeoutMs: 8000, maxBytes: 4 * 1024 * 1024 });
  return extractPreviewImage(res.body, res.url);
}
