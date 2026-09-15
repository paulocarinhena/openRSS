import { requireUser } from "@/lib/session";
import { getChatModelData } from "@/lib/chat-page-data";
import { ChatView } from "./[id]/chat-view";

export default async function ChatIndexPage() {
  const user = await requireUser();
  const { providers, defaults } = await getChatModelData(user.id);

  return (
    <ChatView
      threadId={null}
      title="Nova conversa"
      initialMessages={[]}
      contextArticles={[]}
      aiEnabled={providers.length > 0}
      providers={providers}
      defaults={defaults}
    />
  );
}
