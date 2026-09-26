"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCheck, Eye, EyeOff, Loader2, RefreshCw, Search, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { ArticleDetail, ArticleListItem, ArticleScope } from "@/lib/queries";
import { loadMoreArticles, loadPreviewImagesAction, markAllRead, openArticleAction, setRead, setSaved } from "@/app/actions/articles";
import { refreshFeedAction } from "@/app/actions/feeds";
import { SaveLinkDialog } from "@/components/save-link";
import { TagFilter, type TagCount } from "./tag-filter";
import { updateSettingsAction } from "@/app/actions/settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { ArticleList } from "./article-list";
import { Reader } from "./reader";

import { ViewSwitcher, type ListView } from "./view-switcher";

export function ArticleWorkspace({
  scope,
  title,
  initial,
  unreadOnly,
  query,
  initialArticle,
  listView: initialView,
  timezone,
  aiEnabled,
  ttsEnabled,
  feedError,
  tagFilter,
}: {
  scope: ArticleScope;
  title: string;
  initial: { items: ArticleListItem[]; hasMore: boolean };
  unreadOnly: boolean;
  query?: string;
  initialArticle: ArticleDetail | null;
  listView: ListView;
  timezone: string;
  aiEnabled: boolean;
  ttsEnabled: boolean;
  feedError: string | null;
  tagFilter: { tags: TagCount[]; active: string | undefined } | null;
}) {
  const t = useTranslations("articles");
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ArticleDetail | null>(initialArticle);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [view, setView] = useState<ListView>(initialView);
  const [search, setSearch] = useState(query ?? "");
  const [operationError, setOperationError] = useState<string | null>(null);
  const [loadingMore, startLoadMore] = useTransition();
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const listSize = useResizableWidth("openrss:list-width", { defaultWidth: 416, min: 280, max: 900, minContent: 420 });
  const openRequest = useRef(0);
  const mutationRequest = useRef(new Map<string, number>());
  const mutationQueue = useRef(new Map<string, Promise<void>>());
  const filteredItems = useRef(new Map<string, { item: ArticleListItem; index: number }>());
  const loadingMoreRef = useRef(false);

  const selectedIndex = selected ? items.findIndex((i) => i.id === selected.id) : -1;

  // Busca a imagem de capa (og:image) dos artigos cujo feed não traz imagem, em lotes.
  const requestedImages = useRef(new Set<string>());
  const previewQueue = useRef<string[][]>([]);
  const activePreviewRequests = useRef(0);
  useEffect(() => {
    const missing = items.filter((i) => !i.imageChecked && i.url && !requestedImages.current.has(i.id)).map((i) => i.id);
    if (missing.length === 0) return;
    for (const id of missing) requestedImages.current.add(id);
    for (let i = 0; i < missing.length; i += 12) {
      previewQueue.current.push(missing.slice(i, i + 12));
    }

    function processPreviewQueue() {
      while (activePreviewRequests.current < 2) {
        const batch = previewQueue.current.shift();
        if (!batch) return;
        activePreviewRequests.current++;
        void loadPreviewImagesAction(batch)
          .catch(() => ({}) as Record<string, string | null>)
          .then((found) => {
            setItems((list) =>
              list.map((item) => (Object.hasOwn(found, item.id) ? { ...item, imageUrl: found[item.id] ?? item.imageUrl, imageChecked: true } : item)),
            );
          })
          .finally(() => {
            activePreviewRequests.current--;
            processPreviewQueue();
          });
      }
    }

    processPreviewQueue();
  }, [items]);

  const buildUrl = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const patchItem = useCallback((id: string, patch: Partial<ArticleListItem>) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const persistInOrder = useCallback(async (key: string, operation: () => Promise<void>) => {
    const previous = mutationQueue.current.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    mutationQueue.current.set(key, current);
    try {
      await current;
    } finally {
      if (mutationQueue.current.get(key) === current) mutationQueue.current.delete(key);
    }
  }, []);

  const open = useCallback(
    async (id: string) => {
      const request = ++openRequest.current;
      setLoadingId(id);
      setOperationError(null);
      window.history.replaceState(null, "", buildUrl({ a: id }));
      try {
        const article = await openArticleAction(id);
        if (article) patchItem(id, { isRead: true });
        if (request !== openRequest.current) return;
        setLoadingId(null);
        if (!article) {
          setOperationError(t("errors.notFound"));
          toast.error(t("errors.notFound"));
          return;
        }
        const state = { ...(article.state ?? emptyState(article)), isRead: true, readAt: article.state?.readAt ?? new Date() };
        setSelected({ ...article, state });
        router.refresh();
      } catch {
        if (request !== openRequest.current) return;
        setLoadingId(null);
        setOperationError(t("errors.openFailed"));
        toast.error(t("errors.openFailed"));
      }
    },
    [buildUrl, patchItem, router, t],
  );

  const close = useCallback(() => {
    openRequest.current++;
    setLoadingId(null);
    setSelected(null);
    window.history.replaceState(null, "", buildUrl({ a: null }));
  }, [buildUrl]);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (items.length === 0) return;
      const next = selectedIndex === -1 ? 0 : Math.min(items.length - 1, Math.max(0, selectedIndex + delta));
      if (items[next] && items[next].id !== selected?.id) void open(items[next].id);
    },
    [items, open, selected?.id, selectedIndex],
  );

  const toggleRead = useCallback(
    async (id: string, isRead: boolean) => {
      const previousIndex = items.findIndex((item) => item.id === id);
      const previousItem = items[previousIndex];
      const previousSelected = selected?.id === id ? selected : null;
      const key = `read:${id}`;
      const request = (mutationRequest.current.get(key) ?? 0) + 1;
      mutationRequest.current.set(key, request);
      setOperationError(null);
      if (unreadOnly && isRead) {
        if (previousItem) filteredItems.current.set(key, { item: previousItem, index: previousIndex });
        setItems((list) => list.filter((item) => item.id !== id));
      } else if (unreadOnly && !isRead && !previousItem) {
        const removed = filteredItems.current.get(key);
        if (removed) {
          setItems((list) => {
            const next = [...list];
            next.splice(Math.min(removed.index, next.length), 0, { ...removed.item, isRead: false });
            return next;
          });
          filteredItems.current.delete(key);
        }
      } else patchItem(id, { isRead });
      if (selected?.id === id) setSelected((s) => (s ? { ...s, state: { ...(s.state ?? emptyState(s)), isRead } } : s));
      try {
        await persistInOrder(key, () => setRead(id, isRead));
      } catch {
        if (mutationRequest.current.get(key) !== request) return;
        if (previousItem && unreadOnly && isRead) {
          setItems((list) => {
            const without = list.filter((item) => item.id !== id);
            without.splice(Math.min(previousIndex, without.length), 0, previousItem);
            return without;
          });
        } else if (previousItem) patchItem(id, { isRead: previousItem.isRead });
        if (previousSelected) {
          setSelected((current) => current ? { ...current, state: { ...(current.state ?? emptyState(current)), isRead: previousSelected.state?.isRead ?? false } } : current);
        }
        setOperationError(t("errors.readStateFailed"));
        toast.error(t("errors.readStateFailed"));
      }
    },
    [items, patchItem, persistInOrder, selected, t, unreadOnly],
  );

  const toggleSaved = useCallback(
    async (id: string, isSaved: boolean) => {
      const previousIndex = items.findIndex((item) => item.id === id);
      const previousItem = items[previousIndex];
      const previousSelected = selected?.id === id ? selected : null;
      const key = `saved:${id}`;
      const request = (mutationRequest.current.get(key) ?? 0) + 1;
      mutationRequest.current.set(key, request);
      setOperationError(null);
      if (scope.kind === "saved" && !isSaved) {
        if (previousItem) filteredItems.current.set(key, { item: previousItem, index: previousIndex });
        setItems((list) => list.filter((item) => item.id !== id));
      } else if (scope.kind === "saved" && isSaved && !previousItem) {
        const removed = filteredItems.current.get(key);
        if (removed) {
          setItems((list) => {
            const next = [...list];
            next.splice(Math.min(removed.index, next.length), 0, { ...removed.item, isSaved: true });
            return next;
          });
          filteredItems.current.delete(key);
        }
      } else patchItem(id, { isSaved });
      if (selected?.id === id) setSelected((s) => (s ? { ...s, state: { ...(s.state ?? emptyState(s)), isSaved } } : s));
      try {
        await persistInOrder(key, () => setSaved(id, isSaved));
        toast.success(isSaved ? t("saved") : t("unsaved"));
      } catch {
        if (mutationRequest.current.get(key) !== request) return;
        if (previousItem && scope.kind === "saved" && !isSaved) {
          setItems((list) => {
            const without = list.filter((item) => item.id !== id);
            without.splice(Math.min(previousIndex, without.length), 0, previousItem);
            return without;
          });
        } else if (previousItem) patchItem(id, { isSaved: previousItem.isSaved });
        if (previousSelected) {
          setSelected((current) => current ? { ...current, state: { ...(current.state ?? emptyState(current)), isSaved: previousSelected.state?.isSaved ?? false } } : current);
        }
        setOperationError(t("errors.savedStateFailed"));
        toast.error(t("errors.savedStateFailed"));
      }
    },
    [items, patchItem, persistInOrder, scope.kind, selected, t],
  );

  const doMarkAll = useCallback(() => {
    startTransition(async () => {
      const previousItems = items;
      const previousHasMore = hasMore;
      const previousSelected = selected;
      setOperationError(null);
      setItems((list) => (unreadOnly ? [] : list.map((i) => ({ ...i, isRead: true }))));
      if (unreadOnly) setHasMore(false);
      setSelected((article) =>
        article ? { ...article, state: { ...(article.state ?? emptyState(article)), isRead: true } } : article,
      );
      try {
        const { count, nextFeedId } = await markAllRead(scope);
        toast.success(count ? t("markedRead", { count }) : t("nothingToMark"));
        if (nextFeedId) {
          const params = new URLSearchParams(window.location.search);
          params.delete("a");
          params.delete("q");
          const qs = params.toString();
          router.push(qs ? `/feed/${nextFeedId}?${qs}` : `/feed/${nextFeedId}`);
        } else {
          router.refresh();
        }
      } catch {
        setItems(previousItems);
        setHasMore(previousHasMore);
        setSelected(previousSelected);
        setOperationError(t("errors.markAllFailed"));
        toast.error(t("errors.markAllFailed"));
      }
    });
  }, [hasMore, items, router, scope, selected, t, unreadOnly]);

  const refreshFeed = useCallback(() => {
    if (scope.kind !== "feed") return;
    startTransition(async () => {
      setOperationError(null);
      try {
        const res = await refreshFeedAction(scope.feedId);
        if (!res.ok) {
          setOperationError(res.error);
          toast.error(res.error);
          return;
        }
        const fresh = await loadMoreArticles(scope, 0, unreadOnly, query);
        setItems(fresh.items);
        setHasMore(fresh.hasMore);
        setPage(0);
        toast.success(res.added ? t("newArticles", { count: res.added }) : t("noNewArticles"));
        router.refresh();
      } catch {
        setOperationError(t("errors.refreshFailed"));
        toast.error(t("errors.refreshFailed"));
      }
    });
  }, [query, router, scope, t, unreadOnly]);

  function loadMore() {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    startLoadMore(async () => {
      try {
        const next = await loadMoreArticles(scope, page + 1, unreadOnly, query);
        setItems((list) => [...list, ...next.items.filter((n) => !list.some((i) => i.id === n.id))]);
        setHasMore(next.hasMore);
        setPage((p) => p + 1);
      } finally {
        loadingMoreRef.current = false;
      }
    });
  }

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "j":
          move(1);
          break;
        case "k":
          move(-1);
          break;
        case "Escape":
          close();
          break;
        case "o":
        case "v":
          if (selected?.url) window.open(selected.url, "_blank", "noopener");
          break;
        case "m":
          if (selected) void toggleRead(selected.id, !(selected.state?.isRead ?? true));
          break;
        case "s":
          if (selected) void toggleSaved(selected.id, !selected.state?.isSaved);
          break;
        case "A":
          if (e.shiftKey) doMarkAll();
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, doMarkAll, move, selected, toggleRead, toggleSaved]);

  const changeView = (next: ListView) => {
    if (next === view) return;
    setView(next);
    void updateSettingsAction({ listView: next });
  };

  const empty = scope.kind === "saved" ? t("empty.saved") : unreadOnly ? t("empty.allRead") : t("empty.none");

  return (
    <div className="flex h-full min-h-0">
      <section
        style={{ "--list-w": `${listSize.width}px` } as React.CSSProperties}
        className={cn(
          "relative flex min-h-0 w-full flex-col border-r border-border xl:shrink-0",
          selected ? "hidden xl:flex xl:w-(--list-w)" : "flex border-r-0",
          // Sem artigo aberto: cards ocupam a largura toda; "Só títulos" fica numa coluna de leitura.
          !selected && "xl:w-full",
        )}
      >
        <header className="flex flex-col gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h1>
            {scope.kind === "feed" && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("refreshFeed")}
                aria-label={t("refreshFeed")}
                disabled={pending}
                onClick={refreshFeed}
              >
                <RefreshCw className={cn(pending && "animate-spin")} />
              </Button>
            )}
            {scope.kind === "saved" && <SaveLinkDialog />}
            <ViewSwitcher value={view} onChange={changeView} />
            {scope.kind !== "saved" && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={unreadOnly ? t("showAll") : t("unreadOnly")}
                aria-label={unreadOnly ? t("showAll") : t("unreadOnly")}
                onClick={() => router.replace(buildUrl({ unread: unreadOnly ? "0" : null, a: null }))}
              >
                {unreadOnly ? <EyeOff /> : <Eye />}
              </Button>
            )}
            {scope.kind !== "saved" && (
              <Button variant="ghost" size="icon-sm" title={t("markAllReadShortcut")} aria-label={t("markAllRead")} disabled={pending} onClick={doMarkAll}>
                <CheckCheck />
              </Button>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.replace(buildUrl({ q: search.trim() || null, a: null }));
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("search")} className="h-8 pl-8" />
          </form>
          {scope.kind === "today" && aiEnabled && (
            <p className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
              <Sparkles className="size-3 text-ai" /> {t("aiOrdered")}
            </p>
          )}
          {tagFilter && <TagFilter tags={tagFilter.tags} active={tagFilter.active} />}
          {feedError && (
            <p role="status" className="flex items-center gap-1.5 text-[0.6875rem] text-warning">
              <TriangleAlert className="size-3" /> {t("lastError", { error: feedError })}
            </p>
          )}
          {operationError && (
            <p role="alert" aria-live="assertive" className="flex items-center gap-1.5 text-[0.6875rem] text-destructive">
              <TriangleAlert className="size-3" /> {operationError}
            </p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted-foreground">{empty}</p>
          ) : (
            <>
              <ArticleList
                items={items}
                view={view}
                layout={selected ? "list" : "cards"}
                selectedId={selected?.id ?? null}
                loadingId={loadingId}
                showFeed={scope.kind !== "feed"}
                timezone={timezone}
                onOpen={open}
                onToggleRead={toggleRead}
                onToggleSaved={toggleSaved}
              />
              {hasMore && (
                <div className="p-4">
                  <Button className="w-full" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? <Loader2 className="animate-spin" /> : t("loadMore")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        {selected && (
          <ResizeHandle
            className="hidden xl:block"
            label={t("resizeList")}
            dragging={listSize.dragging}
            {...listSize.handleProps}
          />
        )}
      </section>

      {selected && (
        <Reader
          key={selected.id}
          article={selected}
          aiEnabled={aiEnabled}
          ttsEnabled={ttsEnabled}
          onClose={close}
          onPrev={selectedIndex > 0 ? () => move(-1) : undefined}
          onNext={selectedIndex !== -1 && selectedIndex < items.length - 1 ? () => move(1) : undefined}
          onToggleRead={() => toggleRead(selected.id, !(selected.state?.isRead ?? true))}
          onToggleSaved={() => toggleSaved(selected.id, !selected.state?.isSaved)}
        />
      )}
    </div>
  );
}

function emptyState(a: ArticleDetail): NonNullable<ArticleDetail["state"]> {
  return {
    userId: "",
    articleId: a.id,
    isRead: false,
    isSaved: false,
    readAt: null,
    savedAt: null,
    priorityScore: null,
    priorityReason: null,
    classifiedAt: null,
    isHighlighted: false,
  };
}
