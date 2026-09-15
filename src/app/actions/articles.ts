"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { extractFullContent } from "@/lib/feeds/extract";
import { findPreviewImage } from "@/lib/feeds/preview-image";
import { articleScopeWhere, getArticle, listArticles, type ArticleScope } from "@/lib/queries";

/** Carrega o artigo para o leitor e marca como lido. */
export async function openArticleAction(articleId: string) {
  const user = await requireUser();
  const article = await getArticle(user.id, articleId);
  if (!article) return null;
  if (!article.state?.isRead) {
    await db.userArticle.upsert({
      where: { userId_articleId: { userId: user.id, articleId } },
      create: { userId: user.id, articleId, isRead: true, readAt: new Date() },
      update: { isRead: true, readAt: new Date() },
    });
  }
  return article;
}

async function assertAccess(userId: string, articleId: string) {
  const ok = await db.article.count({
    where: {
      id: articleId,
      OR: [{ feed: { subscriptions: { some: { userId } } } }, { states: { some: { userId, isSaved: true } } }],
    },
  });
  if (!ok) throw new Error((await getTranslations("articles.errors"))("notFound"));
}

export async function setRead(articleId: string, isRead: boolean) {
  const user = await requireUser();
  await assertAccess(user.id, articleId);
  await db.userArticle.upsert({
    where: { userId_articleId: { userId: user.id, articleId } },
    create: { userId: user.id, articleId, isRead, readAt: isRead ? new Date() : null },
    update: { isRead, readAt: isRead ? new Date() : null },
  });
  revalidatePath("/", "layout");
}

export async function setSaved(articleId: string, isSaved: boolean) {
  const user = await requireUser();
  await assertAccess(user.id, articleId);
  await db.userArticle.upsert({
    where: { userId_articleId: { userId: user.id, articleId } },
    create: { userId: user.id, articleId, isSaved, savedAt: isSaved ? new Date() : null },
    update: { isSaved, savedAt: isSaved ? new Date() : null },
  });
  revalidatePath("/", "layout");
}

/** Marca como lidos todos os artigos do escopo publicados até o início da operação. */
export async function markAllRead(scope: ArticleScope) {
  const user = await requireUser();
  const cutoff = new Date();
  const rows = await db.article.findMany({
    where: {
      AND: [
        await articleScopeWhere(user.id, scope),
        { publishedAt: { lte: cutoff } },
        { NOT: { states: { some: { userId: user.id, isRead: true } } } },
      ],
    },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;

  const now = new Date();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await db.$transaction(
      chunk.map((articleId) =>
        db.userArticle.upsert({
          where: { userId_articleId: { userId: user.id, articleId } },
          create: { userId: user.id, articleId, isRead: true, readAt: now },
          update: { isRead: true, readAt: now },
        }),
      ),
    );
  }
  revalidatePath("/", "layout");
  return ids.length;
}

/** Busca o conteúdo completo do artigo original (Readability) e guarda. */
export async function loadFullContent(articleId: string): Promise<{ html?: string; error?: string }> {
  const user = await requireUser();
  await assertAccess(user.id, articleId);
  const article = await db.article.findUniqueOrThrow({ where: { id: articleId } });
  if (article.fullContentHtml) return { html: article.fullContentHtml };
  const t = await getTranslations("articles.errors");
  if (!article.url) return { error: t("noOriginalLink") };
  try {
    const html = await extractFullContent(article.url);
    if (!html) return { error: t("extractFailed") };
    await db.article.update({ where: { id: articleId }, data: { fullContentHtml: html } });
    return { html };
  } catch (err) {
    return { error: err instanceof Error ? err.message : t("fetchFailed") };
  }
}

/**
 * Busca a imagem de capa (og:image) dos artigos cujo feed não traz imagem.
 * Grava "" quando não encontra, para não buscar de novo.
 */
export async function loadPreviewImagesAction(articleIds: string[]): Promise<Record<string, string | null>> {
  const user = await requireUser();
  const articles = await db.article.findMany({
    where: { id: { in: articleIds.slice(0, 24) }, imageUrl: null, url: { not: null }, feed: { subscriptions: { some: { userId: user.id } } } },
    select: { id: true, url: true },
  });

  const result: Record<string, string | null> = {};
  const queue = [...articles];
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let a = queue.shift(); a; a = queue.shift()) {
        try {
          const image = await findPreviewImage(a.url!);
          await db.article.update({ where: { id: a.id }, data: { imageUrl: image ?? "" } });
          result[a.id] = image;
        } catch {
          // Falhas transitórias não são persistidas; uma sessão futura pode tentar novamente.
        }
      }
    }),
  );
  return result;
}

export async function loadMoreArticles(scope: ArticleScope, page: number, unreadOnly: boolean, query?: string) {
  const user = await requireUser();
  return listArticles(user.id, scope, { page, unreadOnly, query });
}
