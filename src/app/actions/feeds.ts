"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { discoverFeeds } from "@/lib/feeds/discover";
import { parseOpml } from "@/lib/feeds/opml";
import { refreshFeed, refreshFeedsNow, subscribe } from "@/lib/feeds/refresh";
import { classifyNewArticles } from "@/lib/ai/classify";
import { applyRulesToArticles } from "@/lib/rules/apply";
import { actionErrorMessage } from "@/lib/action-errors";
import { localizeError } from "@/lib/localized-error";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Mensagens do zod são chaves de feeds.errors.
const errors = () => getTranslations("feeds.errors");

const MAX_OPML_FEEDS = 500;

const fail = async (err: unknown): Promise<{ ok: false; error: string }> => ({
  ok: false,
  error: err instanceof z.ZodError ? actionErrorMessage(await errors(), err) : localizeError(err, await getLocale()),
});

export async function discoverAction(input: string): Promise<Result<{ feeds: { url: string; title: string; siteUrl: string | null; itemCount: number; subscribed: boolean }[] }>> {
  const user = await requireUser();
  try {
    const found = await discoverFeeds(z.string().min(3, "urlRequired").parse(input));
    if (found.length === 0) return { ok: false, error: (await errors())("noneFound") };
    const subs = await db.subscription.findMany({
      where: { userId: user.id, feed: { url: { in: found.map((f) => f.url) } } },
      select: { feed: { select: { url: true } } },
    });
    const subscribed = new Set(subs.map((s) => s.feed.url));
    return {
      ok: true,
      feeds: found.map(({ url, title, siteUrl, itemCount }) => ({ url, title, siteUrl, itemCount, subscribed: subscribed.has(url) })),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function subscribeAction(url: string, folderId: string | null): Promise<Result<{ feedId: string }>> {
  const user = await requireUser();
  try {
    if (folderId) await db.folder.findFirstOrThrow({ where: { id: folderId, userId: user.id } });
    const sub = await subscribe(user.id, z.url().parse(url), { folderId });
    revalidatePath("/", "layout");
    return { ok: true, feedId: sub.feedId };
  } catch (err) {
    return fail(err);
  }
}

export async function unsubscribeAction(subscriptionId: string): Promise<Result> {
  const user = await requireUser();
  await db.subscription.deleteMany({ where: { id: subscriptionId, userId: user.id } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function unsubscribeManyAction(subscriptionIds: string[]): Promise<Result<{ count: number }>> {
  const user = await requireUser();
  const { count } = await db.subscription.deleteMany({ where: { id: { in: subscriptionIds }, userId: user.id } });
  revalidatePath("/", "layout");
  return { ok: true, count };
}

export async function updateSubscriptionAction(
  subscriptionId: string,
  data: { customTitle?: string | null; folderId?: string | null },
): Promise<Result> {
  const user = await requireUser();
  try {
    if (data.folderId) await db.folder.findFirstOrThrow({ where: { id: data.folderId, userId: user.id } });
    await db.subscription.updateMany({
      where: { id: subscriptionId, userId: user.id },
      data: {
        ...(data.customTitle !== undefined ? { customTitle: data.customTitle?.trim() || null } : {}),
        ...(data.folderId !== undefined ? { folderId: data.folderId } : {}),
      },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function refreshFeedAction(feedId: string): Promise<Result<{ added: number }>> {
  const user = await requireUser();
  const sub = await db.subscription.findFirst({ where: { userId: user.id, feedId } });
  if (!sub) return { ok: false, error: (await errors())("feedNotFound") };
  const { newArticleIds, error } = await refreshFeed(feedId);
  if (error) return { ok: false, error: localizeError(error, await getLocale()) };
  // Regras de texto antes de responder (a lista já volta filtrada); a IA segue em segundo plano.
  await applyRulesToArticles(newArticleIds, "ingest").catch(() => {});
  void classifyNewArticles(newArticleIds).catch(() => {});
  revalidatePath("/", "layout");
  return { ok: true, added: newArticleIds.length };
}

export async function refreshAllFeedsAction(): Promise<Result<{ added: number }>> {
  const user = await requireUser();
  const subs = await db.subscription.findMany({ where: { userId: user.id }, select: { feedId: true }, distinct: ["feedId"] });
  const newArticleIds = await refreshFeedsNow(subs.map((s) => s.feedId));
  // Regras de texto antes de responder (a lista já volta filtrada); a IA segue em segundo plano.
  await applyRulesToArticles(newArticleIds, "ingest").catch(() => {});
  void classifyNewArticles(newArticleIds).catch(() => {});
  revalidatePath("/", "layout");
  return { ok: true, added: newArticleIds.length };
}

const folderName = z.string().trim().min(1, "nameRequired").max(60);

export async function createFolderAction(name: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  try {
    const value = folderName.parse(name);
    const existing = await db.folder.findFirst({ where: { userId: user.id, name: value }, select: { id: true } });
    if (existing) return { ok: false, error: (await errors())("folderExists") };
    const count = await db.folder.count({ where: { userId: user.id } });
    const folder = await db.folder.create({ data: { userId: user.id, name: value, position: count } });
    revalidatePath("/", "layout");
    return { ok: true, id: folder.id };
  } catch (err) {
    return fail(err);
  }
}

export async function renameFolderAction(folderId: string, name: string): Promise<Result> {
  const user = await requireUser();
  try {
    await db.folder.updateMany({ where: { id: folderId, userId: user.id }, data: { name: folderName.parse(name) } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteFolderAction(folderId: string): Promise<Result> {
  const user = await requireUser();
  await db.folder.deleteMany({ where: { id: folderId, userId: user.id } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function importOpmlAction(formData: FormData): Promise<Result<{ imported: number; failed: number }>> {
  const user = await requireUser();
  const t = await errors();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: t("opmlRequired") };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: t("fileTooLarge") };

  const entries = parseOpml(await file.text());
  if (entries.length === 0) return { ok: false, error: t("opmlEmpty") };
  // Cada entrada nova dispara uma requisição externa; limita o volume por importação.
  if (entries.length > MAX_OPML_FEEDS) return { ok: false, error: t("opmlTooMany", { max: MAX_OPML_FEEDS }) };

  const folderIds = new Map<string, string>();
  for (const name of new Set(entries.map((e) => e.folder).filter((f): f is string => Boolean(f)))) {
    const folder = await db.folder.upsert({
      where: { userId_name: { userId: user.id, name } },
      create: { userId: user.id, name },
      update: {},
    });
    folderIds.set(name, folder.id);
  }

  let imported = 0;
  let failed = 0;
  const queue = [...entries];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        try {
          await subscribe(user.id, e.url, { folderId: e.folder ? folderIds.get(e.folder) : null });
          imported++;
        } catch {
          failed++;
        }
      }
    }),
  );
  revalidatePath("/", "layout");
  return { ok: true, imported, failed };
}
