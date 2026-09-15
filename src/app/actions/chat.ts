"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Título vazio = sem título; a UI mostra um placeholder traduzido e a rota do chat gera o título na 1ª mensagem.
const untitled = "";

export async function createThreadAction(articleIds: string[] = []) {
  const user = await requireUser();
  const allowed = articleIds.length
    ? await db.article.findMany({
        where: { id: { in: articleIds.slice(0, 20) }, feed: { subscriptions: { some: { userId: user.id } } } },
        select: { id: true, title: true },
      })
    : [];
  const thread = await db.chatThread.create({
    data: {
      userId: user.id,
      title: allowed.length === 1 ? allowed[0].title.slice(0, 80) : untitled,
      articleIds: JSON.stringify(allowed.map((a) => a.id)),
    },
  });
  redirect(`/chat/${thread.id}`);
}

/** Cria a conversa e devolve o id (a tela inicial do chat envia a primeira mensagem em seguida). */
export async function startThreadAction(articleIds: string[] = []) {
  const user = await requireUser();
  const allowed = articleIds.length
    ? await db.article.findMany({
        where: { id: { in: articleIds.slice(0, 20) }, feed: { subscriptions: { some: { userId: user.id } } } },
        select: { id: true, title: true },
      })
    : [];
  const thread = await db.chatThread.create({
    data: {
      userId: user.id,
      title: allowed.length === 1 ? allowed[0].title.slice(0, 80) : untitled,
      articleIds: JSON.stringify(allowed.map((a) => a.id)),
    },
  });
  revalidatePath("/chat", "layout");
  return { id: thread.id };
}

/** Exclui várias conversas do usuário de uma vez. */
export async function deleteThreadsAction(threadIds: string[]) {
  const user = await requireUser();
  const ids = (Array.isArray(threadIds) ? threadIds : []).filter((id): id is string => typeof id === "string").slice(0, 500);
  if (ids.length === 0) {
    const t = await getTranslations("chat.errors");
    return { ok: false as const, error: t("noneSelected") };
  }

  const where = { id: { in: ids }, userId: user.id };
  const [, { count }] = await db.$transaction([
    db.chatMessage.deleteMany({ where: { thread: where } }),
    db.chatThread.deleteMany({ where }),
  ]);
  revalidatePath("/chat", "layout");
  return { ok: true as const, count };
}

export async function deleteThreadAction(threadId: string) {
  const user = await requireUser();
  await db.chatThread.deleteMany({ where: { id: threadId, userId: user.id } });
  revalidatePath("/chat");
  redirect("/chat");
}
