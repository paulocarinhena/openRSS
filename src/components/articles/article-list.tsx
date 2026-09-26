"use client";

import { Bookmark, Circle, CircleCheck, ExternalLink, Flag, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ArticleListItem } from "@/lib/queries";
import { cn, relativeTime } from "@/lib/utils";
import { FeedIcon } from "@/components/feed-icon";
import { Button } from "@/components/ui/button";
import type { ListView } from "./view-switcher";

type Props = {
  items: ArticleListItem[];
  view: ListView;
  /** "cards": largura toda, nenhum artigo aberto. "list": coluna compacta ao lado do leitor. */
  layout: "cards" | "list";
  selectedId: string | null;
  loadingId: string | null;
  showFeed: boolean;
  timezone: string;
  onOpen: (id: string) => void;
  onToggleRead: (id: string, isRead: boolean) => void;
  onToggleSaved: (id: string, isSaved: boolean) => void;
};

export function ArticleList(props: Props) {
  if (props.layout === "cards" && props.view === "cards") return <ArticleCards {...props} />;
  if (props.layout === "cards" && props.view === "grid") return <ArticleGrid {...props} />;
  if (props.layout === "cards" && props.view === "titles") return <ArticleTextList {...props} />;
  return <ArticleRows {...props} />;
}

function Time({ date }: { date: Date }) {
  const locale = useLocale();
  return (
    <time dateTime={date.toISOString()} suppressHydrationWarning className="shrink-0">
      {relativeTime(date, locale)}
    </time>
  );
}

/** Marcador de "não lido" com rótulo acessível. */
function UnreadDot({ className }: { className?: string }) {
  const t = useTranslations("articles");
  return <span aria-label={t("unread")} className={cn("size-1.5 shrink-0 rounded-full bg-primary", className)} />;
}

function SavedIcon({ className }: { className?: string }) {
  const t = useTranslations("articles");
  return <Bookmark className={className} aria-label={t("saved")} />;
}

/** Marcador das regras com a ação "destacar". */
function HighlightMark({ item }: { item: ArticleListItem }) {
  const t = useTranslations("articles");
  if (!item.isHighlighted) return null;
  return <Flag className="ml-1 inline size-3 shrink-0 -translate-y-px fill-current align-baseline text-warning" aria-label={t("highlighted")} />;
}

function PriorityBadge({ item, threshold = 70 }: { item: ArticleListItem; threshold?: number }) {
  if (item.priorityScore === null || item.priorityScore < threshold) return null;
  return (
    <span
      title={item.priorityReason ?? undefined}
      className="inline-flex max-w-full items-center gap-1 self-start truncate rounded-full border border-border px-1.5 py-px text-[0.625rem] font-medium text-ai"
    >
      <Sparkles className="size-2.5 shrink-0" />
      <span className="font-mono">{item.priorityScore}</span>
      {item.priorityReason && <span className="truncate text-muted-foreground">{item.priorityReason}</span>}
    </span>
  );
}

function PreviewImage({ item, className }: { item: ArticleListItem; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!item.imageUrl || failed) {
    return (
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <FeedIcon src={item.feed.iconUrl} className="size-6 opacity-50" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

/** Ações rápidas (hover/foco; sempre visíveis quando salvo). Animação em .card-actions (globals.css). */
function CardActions({
  article: a,
  onToggleRead,
  onToggleSaved,
  className,
  pinWhenSaved = true,
}: {
  article: ArticleListItem;
  onToggleRead: Props["onToggleRead"];
  onToggleSaved: Props["onToggleSaved"];
  className?: string;
  /** Mantém as ações visíveis quando o artigo está salvo. */
  pinWhenSaved?: boolean;
}) {
  const t = useTranslations("articles");
  return (
    <div
      data-visible={(pinWhenSaved && a.isSaved) || undefined}
      className={cn(
        "card-actions absolute top-3 right-3 flex items-center gap-0.5 rounded-control border border-border bg-surface/90 p-0.5 shadow-control backdrop-blur",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-7"
        title={a.isSaved ? t("removeSaved") : t("save")}
        aria-label={a.isSaved ? t("removeSaved") : t("save")}
        onClick={() => onToggleSaved(a.id, !a.isSaved)}
      >
        <Bookmark className={cn(a.isSaved && "fill-current text-foreground")} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-7"
        title={a.isRead ? t("markUnread") : t("markRead")}
        aria-label={a.isRead ? t("markUnread") : t("markRead")}
        onClick={() => onToggleRead(a.id, !a.isRead)}
      >
        {a.isRead ? <CircleCheck /> : <Circle />}
      </Button>
      {a.url && (
        <Button asChild variant="ghost" size="icon-sm" className="size-7" title={t("openOriginal")} aria-label={t("openOriginal")}>
          <a href={a.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
          </a>
        </Button>
      )}
    </div>
  );
}

const cardSurface = cn(
  "group relative overflow-hidden rounded-card border border-border bg-surface shadow-control transition-[border-color,box-shadow,opacity] duration-200",
  "hover:border-ring/40 hover:shadow-card dark:hover:border-white/25",
);

/* ── Cartões: horizontais, um por linha ───────────────────────────────── */

function ArticleCards({ items, loadingId, showFeed, onOpen, onToggleRead, onToggleSaved }: Props) {
  return (
    <ul className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4 sm:p-5">
      {items.map((a) => {
        const pendingImage = !a.imageUrl && !a.imageChecked && Boolean(a.url);
        const hasMedia = Boolean(a.imageUrl) || pendingImage;
        return (
          <li key={a.id}>
            <article className={cn(cardSurface, a.isRead && "opacity-70 hover:opacity-100")}>
              <button
                type="button"
                onClick={() => onOpen(a.id)}
                className="flex w-full cursor-pointer flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row"
              >
                {hasMedia && (
                  <div
                    className={cn(
                      "relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-muted sm:aspect-auto sm:min-h-40 sm:w-60 sm:self-stretch",
                      pendingImage && "animate-pulse",
                    )}
                  >
                    {a.imageUrl && (
                      <PreviewImage
                        key={a.imageUrl}
                        item={a}
                        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    )}
                  </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
                  <div className="flex min-w-0 items-center gap-1.5 pr-28 text-[0.6875rem] text-muted-foreground">
                    {!a.isRead && <UnreadDot />}
                    <FeedIcon src={a.feed.iconUrl} className="size-3.5" />
                    {showFeed && <span className="truncate font-medium text-foreground/80">{a.feed.title}</span>}
                    {showFeed && a.author && <span aria-hidden>·</span>}
                    {a.author && <span className="truncate">{a.author}</span>}
                    <span aria-hidden>·</span>
                    <Time date={a.publishedAt} />
                    {loadingId === a.id && <Loader2 className="size-3 shrink-0 animate-spin" />}
                  </div>

                  <h3
                    className={cn(
                      "line-clamp-2 text-base leading-snug tracking-tight text-balance",
                      a.isRead ? "font-medium text-muted-foreground" : "font-semibold text-foreground dark:font-medium",
                    )}
                  >
                    {a.title}
                    <HighlightMark item={a} />
                  </h3>

                  {(a.excerpt ?? a.snippet) && (
                    <p className="line-clamp-3 text-[0.8125rem] leading-relaxed text-muted-foreground">{a.excerpt ?? a.snippet}</p>
                  )}

                  <PriorityBadge item={a} threshold={50} />
                </div>
              </button>

              <CardActions article={a} onToggleRead={onToggleRead} onToggleSaved={onToggleSaved} />
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Grade: cards menores, vários por linha ───────────────────────────── */

function ArticleGrid({ items, loadingId, showFeed, onOpen, onToggleRead, onToggleSaved }: Props) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 p-4 sm:p-5">
      {items.map((a) => {
        const pendingImage = !a.imageUrl && !a.imageChecked && Boolean(a.url);
        return (
          <li key={a.id} className="min-w-0">
            <article className={cn(cardSurface, "flex h-full flex-col", a.isRead && "opacity-70 hover:opacity-100")}>
              <button
                type="button"
                onClick={() => onOpen(a.id)}
                className="flex h-full w-full cursor-pointer flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className={cn("relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-muted", pendingImage && "animate-pulse")}>
                  {a.imageUrl ? (
                    <PreviewImage
                      key={a.imageUrl}
                      item={a}
                      className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    !pendingImage && (
                      <div className="flex size-full items-center justify-center">
                        <FeedIcon src={a.feed.iconUrl} className="size-6 opacity-50" />
                      </div>
                    )
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
                  <div className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                    {!a.isRead && <UnreadDot />}
                    <FeedIcon src={a.feed.iconUrl} className="size-3" />
                    <span className="truncate">{showFeed ? a.feed.title : (a.author ?? a.feed.title)}</span>
                    <span aria-hidden>·</span>
                    <Time date={a.publishedAt} />
                    {loadingId === a.id && <Loader2 className="size-3 shrink-0 animate-spin" />}
                  </div>

                  <h3
                    className={cn(
                      "line-clamp-3 text-sm leading-snug tracking-tight",
                      a.isRead ? "font-medium text-muted-foreground" : "font-semibold text-foreground dark:font-medium",
                    )}
                  >
                    {a.title}
                    <HighlightMark item={a} />
                  </h3>

                  {(a.excerpt ?? a.snippet) && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{a.excerpt ?? a.snippet}</p>
                  )}

                  <PriorityBadge item={a} threshold={50} />
                </div>
              </button>

              <CardActions article={a} onToggleRead={onToggleRead} onToggleSaved={onToggleSaved} className="top-2 right-2" />
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Só texto: lista de leitura agrupada por dia ──────────────────────── */

function dayLabel(date: Date, timeZone: string, locale: string, labels: { today: string; yesterday: string }, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const day = formatter.format(date);
  const today = formatter.format(now);
  const diffDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  if (diffDays === 0) return labels.today;
  if (diffDays === 1) return labels.yesterday;
  return date.toLocaleDateString(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function ArticleTextList({ items, loadingId, showFeed, timezone, onOpen, onToggleRead, onToggleSaved }: Props) {
  const t = useTranslations("articles");
  const locale = useLocale();
  const dayLabels = { today: t("today"), yesterday: t("yesterday") };
  const groups: { label: string; items: ArticleListItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.publishedAt, timezone, locale, dayLabels);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-2 pb-6 sm:px-4">
      {groups.map((group) => (
        <section key={group.label}>
          <h2
            className="eyebrow sticky top-0 z-10 flex items-center gap-2 bg-background/85 px-3 pt-4 pb-2 backdrop-blur"
            suppressHydrationWarning
          >
            <span className="first-letter:uppercase">{group.label}</span>
            <span className="font-mono text-[0.625rem] text-muted-foreground/70">{group.items.length}</span>
          </h2>

          <ul className="flex flex-col">
            {group.items.map((a) => (
              <li key={a.id}>
                <article
                  className={cn(
                    "group relative flex items-start gap-3 rounded-input px-3 py-3 transition-colors duration-200 hover:bg-accent focus-within:bg-accent",
                    a.isRead && "opacity-75 hover:opacity-100",
                  )}
                >
                  {a.isRead ? (
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-transparent" />
                  ) : (
                    <UnreadDot className="mt-2" />
                  )}

                  <button
                    type="button"
                    onClick={() => onOpen(a.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-accent rounded-sm"
                  >
                    {showFeed && (
                      <span className="hidden w-40 shrink-0 items-center gap-2 pt-0.5 text-xs text-muted-foreground md:flex">
                        <FeedIcon src={a.feed.iconUrl} className="size-3.5" />
                        <span className="truncate">{a.feed.title}</span>
                      </span>
                    )}

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-start gap-2 [&>svg]:mt-0.5">
                        {showFeed && <FeedIcon src={a.feed.iconUrl} className="size-3.5 md:hidden" />}
                        <span
                          className={cn(
                            "line-clamp-2 min-w-0 text-[0.9375rem] leading-snug tracking-tight text-pretty",
                            a.isRead ? "text-muted-foreground" : "font-semibold text-foreground dark:font-medium",
                          )}
                        >
                          {a.title}
                          <HighlightMark item={a} />
                        </span>
                        {a.priorityScore !== null && a.priorityScore >= 70 && (
                          <span
                            title={a.priorityReason ?? undefined}
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border px-1.5 text-[0.625rem] font-medium text-ai"
                          >
                            <Sparkles className="size-2.5" />
                            <span className="font-mono">{a.priorityScore}</span>
                          </span>
                        )}
                      </span>
                      {(a.excerpt ?? a.snippet) && (
                        <span className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                          {!showFeed && a.author && <span className="text-foreground/70">{a.author} · </span>}
                          {a.excerpt ?? a.snippet}
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Horário: dá lugar às ações no hover */}
                  <span className="flex w-24 shrink-0 items-center justify-end gap-1.5 pt-0.5 text-xs text-muted-foreground tabular-nums transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0">
                    {loadingId === a.id && <Loader2 className="size-3 animate-spin" />}
                    {a.isSaved && <SavedIcon className="size-3 fill-current text-foreground/70" />}
                    <Time date={a.publishedAt} />
                  </span>
                  <div className="pointer-events-none absolute top-2 right-2 flex [&>*]:pointer-events-auto">
                    <CardActions article={a} onToggleRead={onToggleRead} onToggleSaved={onToggleSaved} pinWhenSaved={false} className="static" />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ── Lista compacta (coluna ao lado do leitor) ────────────────────────── */

function ArticleRows({ items, view, selectedId, loadingId, showFeed, onOpen }: Props) {
  const titlesOnly = view === "titles";
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        const selected = a.id === selectedId;
        const meta = (
          <div className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            {showFeed && (
              <>
                <FeedIcon src={a.feed.iconUrl} className="size-3.5" />
                <span className="truncate">{a.feed.title}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <Time date={a.publishedAt} />
            {a.isSaved && <SavedIcon className="size-3 shrink-0 fill-current" />}
            {loadingId === a.id && <Loader2 className="size-3 shrink-0 animate-spin" />}
          </div>
        );

        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "group flex w-full cursor-pointer text-left transition-colors duration-200 hover:bg-accent",
                selected && "bg-accent",
                titlesOnly ? "items-center gap-3 px-4 py-2" : "gap-3 px-4 py-3",
              )}
            >
              <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", a.isRead ? "bg-transparent" : "bg-primary", titlesOnly && "hidden")} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {!titlesOnly && meta}
                <p
                  className={cn(
                    "text-sm leading-snug",
                    titlesOnly ? "truncate" : "line-clamp-2",
                    a.isRead ? "text-muted-foreground" : "font-semibold text-foreground dark:font-medium",
                  )}
                >
                  {a.title}
                  <HighlightMark item={a} />
                </p>
                {!titlesOnly && a.snippet && <p className="line-clamp-2 text-xs text-muted-foreground">{a.snippet}</p>}
                {!titlesOnly && <PriorityBadge item={a} />}
              </div>
              {!titlesOnly && a.imageUrl && (
                <span className="relative hidden size-16 shrink-0 overflow-hidden rounded-md bg-muted sm:block">
                  <PreviewImage key={a.imageUrl} item={a} className="absolute inset-0 size-full object-cover" />
                </span>
              )}
              {titlesOnly && <div className="hidden w-40 shrink-0 sm:block">{meta}</div>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
