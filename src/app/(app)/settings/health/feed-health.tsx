"use client";

import Link from "next/link";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { refreshFeedAction, unsubscribeAction, unsubscribeManyAction } from "@/app/actions/feeds";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/input";
import type { FeedHealth, FeedStatus } from "@/lib/feeds/health";
import { cn, relativeTime } from "@/lib/utils";

const FILTERS: (FeedStatus | "all")[] = ["all", "error", "stale", "lowRead", "noisy", "ok"];

const BADGE: Record<FeedStatus, string> = {
  error: "border-destructive/40 text-destructive",
  stale: "border-warning/50 text-warning",
  lowRead: "border-border text-muted-foreground",
  noisy: "border-ai/40 text-ai",
  ok: "border-border text-muted-foreground",
};

const DOT: Record<Exclude<FeedStatus, "ok">, string> = {
  error: "bg-destructive",
  stale: "bg-warning",
  lowRead: "bg-muted-foreground",
  noisy: "bg-ai",
};

export function FeedHealthPanel({ feeds }: { feeds: FeedHealth[] }) {
  const t = useTranslations("health");
  const locale = useLocale();
  const router = useRouter();
  const [filter, setFilter] = useState<FeedStatus | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const count = (s: FeedStatus | "all") => (s === "all" ? feeds.length : feeds.filter((f) => f.status.includes(s)).length);
  const visible = filter === "all" ? feeds : feeds.filter((f) => f.status.includes(filter));
  const when = (d: Date | null) => (d ? relativeTime(new Date(d), locale) : t("never"));

  async function refresh(feed: FeedHealth) {
    setBusy(feed.feedId);
    const res = await refreshFeedAction(feed.feedId);
    setBusy(null);
    if (res.ok) toast.success(t("refreshed", { count: res.added }));
    else toast.error(res.error);
    router.refresh();
  }

  function unsubscribe(feed: FeedHealth) {
    if (!window.confirm(t("unsubscribeConfirm", { title: feed.title }))) return;
    start(async () => {
      await unsubscribeAction(feed.subscriptionId);
      toast.success(t("unsubscribed", { count: 1 }));
      router.refresh();
    });
  }

  function unsubscribeAll() {
    if (!window.confirm(t("unsubscribeAllConfirm", { count: visible.length, filter: t(`status.${filter}`) }))) return;
    start(async () => {
      const res = await unsubscribeManyAction(visible.map((f) => f.subscriptionId));
      if (res.ok) toast.success(t("unsubscribed", { count: res.count }));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="eyebrow">{t("title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["error", "stale", "lowRead", "noisy"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(filter === s ? "all" : s)}
            aria-pressed={filter === s}
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-card border bg-surface p-4 text-left shadow-card transition-colors duration-200",
              filter === s ? "border-primary ring-3 ring-primary/15" : "border-border hover:border-ring/40 dark:hover:border-white/25",
            )}
          >
            <span className="eyebrow flex items-center gap-1.5">
              <span aria-hidden className={cn("size-1.5 rounded-full", count(s) ? DOT[s] : "bg-border")} />
              {t(`status.${s}`)}
            </span>
            <span className={cn("font-mono text-lg", !count(s) && "text-muted-foreground")}>{count(s)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("filter")}>
        {FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={cn(
              "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              filter === s ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`status.${s}`)} · {count(s)}
          </button>
        ))}
        {filter !== "all" && filter !== "ok" && visible.length > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" disabled={pending} onClick={unsubscribeAll}>
            <Trash2 /> {t("unsubscribeAll", { count: visible.length })}
          </Button>
        )}
      </div>

      <Card className="divide-y divide-border p-0">
        {visible.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{feeds.length ? t("emptyFilter") : t("empty")}</p>}
        {visible.map((f) => (
          <div key={f.subscriptionId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5">
                <Link href={`/feed/${f.feedId}`} className="truncate font-medium hover:underline">
                  {f.title}
                </Link>
                {f.status
                  .filter((s) => s !== "ok")
                  .map((s) => (
                    <span key={s} className={cn("rounded-full border px-1.5 text-[0.625rem] font-medium", BADGE[s])}>
                      {t(`badge.${s}`)}
                    </span>
                  ))}
              </p>
              <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">{f.url}</p>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                {t("lastArticle", { when: when(f.lastArticleAt) })} · {t("volume", { count: f.articles30d })} ·{" "}
                {f.articles30d ? t("readRatio", { pct: Math.round((f.read30d / f.articles30d) * 100) }) : t("noRecent")} ·{" "}
                {t("unread", { count: f.unread })} · {t("lastFetched", { when: when(f.lastFetchedAt) })}
              </p>
              {f.status.includes("error") && f.lastError && (
                <p className="mt-1 text-[0.6875rem] text-destructive">{t("errorDetail", { count: f.errorCount, error: f.lastError })}</p>
              )}
            </div>
            <div className="-ml-2 flex shrink-0 gap-1 sm:ml-0">
              <Button variant="ghost" size="sm" disabled={busy === f.feedId} onClick={() => refresh(f)}>
                {busy === f.feedId ? <Loader2 className="animate-spin" /> : <RefreshCw />} {t("refresh")}
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={t("unsubscribe")} title={t("unsubscribe")} disabled={pending} onClick={() => unsubscribe(f)}>
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
