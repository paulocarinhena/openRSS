import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ThreadList } from "./thread-list";
import { MobileThreadList } from "./mobile-thread-list";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("chat") };
}

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const threads = await db.chatThread.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, updatedAt: true },
  });

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="flex h-11 shrink-0 items-center border-b border-border px-2 md:hidden">
        <MobileThreadList threads={threads} />
      </div>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
        <ThreadList threads={threads} />
      </aside>
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
