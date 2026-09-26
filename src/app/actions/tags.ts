"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { accessibleArticles } from "@/lib/article-state";
import { listTags } from "@/lib/tags";

const tagName = z.string().trim().min(1).max(40);

type Fail = { ok: false; error: string };
const fail = async (key: "invalidName" | "notFound" | "exists"): Promise<Fail> => ({ ok: false, error: (await getTranslations("tags.errors"))(key) });

/** Tags do usuário com a quantidade de artigos salvos em cada uma. */
export async function listTagsAction() {
  const user = await requireUser();
  return listTags(user.id);
}

/** Marca o artigo com a tag (criando-a se preciso). Taguear também salva o artigo. */
export async function addTagAction(articleId: string, name: string): Promise<{ ok: true; tag: { id: string; name: string } } | Fail> {
  const user = await requireUser();
  const parsed = tagName.safeParse(name);
  if (!parsed.success) return fail("invalidName");
  const article = await db.article.findFirst({ where: { id: articleId, ...accessibleArticles(user.id) }, select: { id: true } });
  if (!article) return fail("notFound");

  const tag = await db.tag.upsert({
    where: { userId_name: { userId: user.id, name: parsed.data } },
    create: { userId: user.id, name: parsed.data },
    update: {},
    select: { id: true, name: true },
  });
  const now = new Date();
  await db.$transaction([
    db.articleTag.upsert({ where: { tagId_articleId: { tagId: tag.id, articleId } }, create: { tagId: tag.id, articleId }, update: {} }),
    db.userArticle.upsert({
      where: { userId_articleId: { userId: user.id, articleId } },
      create: { userId: user.id, articleId, isSaved: true, savedAt: now },
      update: { isSaved: true, savedAt: now },
    }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true, tag };
}

export async function removeTagAction(articleId: string, tagId: string) {
  const user = await requireUser();
  await db.articleTag.deleteMany({ where: { articleId, tagId, tag: { userId: user.id } } });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function renameTagAction(tagId: string, name: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  const parsed = tagName.safeParse(name);
  if (!parsed.success) return fail("invalidName");
  const tag = await db.tag.findFirst({ where: { id: tagId, userId: user.id } });
  if (!tag) return fail("notFound");
  if (await db.tag.count({ where: { userId: user.id, name: parsed.data, id: { not: tagId } } })) return fail("exists");
  await db.tag.update({ where: { id: tagId }, data: { name: parsed.data } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Apaga a tag; os artigos continuam salvos. */
export async function deleteTagAction(tagId: string) {
  const user = await requireUser();
  await db.tag.deleteMany({ where: { id: tagId, userId: user.id } });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
