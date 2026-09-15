import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getChatModelData } from "@/lib/chat-page-data";
import { parseJsonArray } from "@/lib/utils";
import { ChatView } from "./chat-view";

export default async function ChatThreadPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const thread = await db.chatThread.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) notFound();

  const [contextArticles, { providers, defaults }] = await Promise.all([
    db.article.findMany({ where: { id: { in: parseJsonArray(thread.articleIds) } }, select: { id: true, title: true } }),
    getChatModelData(user.id),
  ]);

  const messages: UIMessage[] = thread.messages.map((m) => ({
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: JSON.parse(m.parts) as UIMessage["parts"],
  }));

  return (
    <ChatView
      key={thread.id}
      threadId={thread.id}
      title={thread.title}
      initialMessages={messages}
      contextArticles={contextArticles}
      aiEnabled={providers.length > 0}
      providers={providers}
      defaults={defaults}
    />
  );
}
