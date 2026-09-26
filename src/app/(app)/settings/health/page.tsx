import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getFeedHealth } from "@/lib/feeds/health";
import { localizeError } from "@/lib/localized-error";
import { FeedHealthPanel } from "./feed-health";

export default async function FeedHealthPage() {
  const user = await requireUser();
  const [feeds, locale] = await Promise.all([getFeedHealth(user.id), getLocale()]);
  return <FeedHealthPanel feeds={feeds.map((f) => ({ ...f, lastError: f.lastError ? localizeError(f.lastError, locale) : null }))} />;
}
