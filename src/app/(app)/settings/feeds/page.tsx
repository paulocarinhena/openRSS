import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { FeedsManager } from "./feeds-manager";

export default async function FeedsSettingsPage() {
  const user = await requireUser();
  const [folders, subscriptions] = await Promise.all([
    db.folder.findMany({ where: { userId: user.id }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.subscription.findMany({
      where: { userId: user.id },
      include: { feed: { select: { title: true, url: true, lastFetchedAt: true, lastError: true, errorCount: true } } },
    }),
  ]);

  return (
    <FeedsManager
      folders={folders}
      subscriptions={subscriptions
        .map((s) => ({
          id: s.id,
          feedId: s.feedId,
          folderId: s.folderId,
          customTitle: s.customTitle,
          title: s.feed.title,
          url: s.feed.url,
          lastFetchedAt: s.feed.lastFetchedAt,
          lastError: s.feed.errorCount > 0 ? s.feed.lastError : null,
        }))
        .sort((a, b) => (a.customTitle ?? a.title).localeCompare(b.customTitle ?? b.title))}
    />
  );
}
