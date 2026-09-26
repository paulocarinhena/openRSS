import { getLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { localizeError } from "@/lib/localized-error";
import { requireUser } from "@/lib/session";
import { FeedsManager } from "./feeds-manager";

export default async function FeedsSettingsPage() {
  const user = await requireUser();
  const locale = await getLocale();
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
          lastError: s.feed.errorCount > 0 && s.feed.lastError ? localizeError(s.feed.lastError, locale) : null,
        }))
        .sort((a, b) => (a.customTitle ?? a.title).localeCompare(b.customTitle ?? b.title))}
    />
  );
}
