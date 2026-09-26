import "server-only";
import { db } from "@/lib/db";
import { accessibleArticles } from "@/lib/article-state";
import { stripHtml, truncate } from "@/lib/utils";
import { extractPage } from "./extract";

// Links avulsos salvos para ler depois ficam num feed virtual por usuário. Ele não tem
// assinatura: não aparece na barra lateral e o agendador nunca o atualiza; os artigos
// continuam acessíveis porque estão salvos (e a retenção preserva salvos).
const SAVED_LINKS_PREFIX = "urn:openrss:saved-links:";

export const isSavedLinksFeed = (feedUrl: string) => feedUrl.startsWith(SAVED_LINKS_PREFIX);

/** Aceita só http(s); tira o fragmento, que não muda a página. */
export function normalizeLinkUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Primeira URL http(s) de um texto (o menu Compartilhar do celular às vezes manda o link no texto). */
export function firstUrlIn(text: string | null | undefined): string | null {
  const match = text?.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  return match ? normalizeLinkUrl(match.replace(/[).,;!?]+$/, "")) : null;
}

async function savedLinksFeed(userId: string, title: string) {
  const url = `${SAVED_LINKS_PREFIX}${userId}`;
  return db.feed.upsert({
    where: { url },
    create: { url, title, nextFetchAt: new Date("2999-01-01T00:00:00Z") },
    update: {},
  });
}

async function markSaved(userId: string, articleId: string) {
  const now = new Date();
  await db.userArticle.upsert({
    where: { userId_articleId: { userId, articleId } },
    create: { userId, articleId, isSaved: true, savedAt: now },
    update: { isSaved: true, savedAt: now },
  });
}

/**
 * Salva um link para ler depois. Se o usuário já tem esse artigo (de um feed que assina
 * ou salvo antes), só marca como salvo; senão baixa a página, extrai o texto e cria o artigo.
 */
export async function saveLink(userId: string, rawUrl: string, feedTitle: string): Promise<{ articleId: string; existed: boolean }> {
  const url = normalizeLinkUrl(rawUrl);
  if (!url) throw new Error("invalidUrl");

  const existing = await db.article.findFirst({ where: { url, ...accessibleArticles(userId) }, select: { id: true } });
  if (existing) {
    await markSaved(userId, existing.id);
    return { articleId: existing.id, existed: true };
  }

  const feed = await savedLinksFeed(userId, feedTitle);
  const previous = await db.article.findUnique({ where: { feedId_guid: { feedId: feed.id, guid: url } }, select: { id: true } });
  if (previous) {
    await markSaved(userId, previous.id);
    return { articleId: previous.id, existed: true };
  }

  const page = await extractPage(url);
  const host = new URL(page.url).hostname.replace(/^www\./, "");
  const text = page.excerpt ?? (page.html ? truncate(stripHtml(page.html), 280) : null);
  const article = await db.article.create({
    data: {
      feedId: feed.id,
      guid: url,
      url: page.url,
      title: page.title || host,
      author: page.byline ?? page.siteName ?? host,
      contentHtml: page.html,
      fullContentHtml: page.html,
      snippet: text,
      imageUrl: page.imageUrl ?? "",
      publishedAt: new Date(),
      ref: { create: {} },
    },
    select: { id: true },
  });
  await markSaved(userId, article.id);
  return { articleId: article.id, existed: false };
}
