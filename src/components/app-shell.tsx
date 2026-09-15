"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Bookmark,
  Check,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  Inbox,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Settings,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import type { SidebarData } from "@/lib/queries";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { createFolderAction, refreshAllFeedsAction, renameFolderAction, updateSubscriptionAction } from "@/app/actions/feeds";
import { AddFeedDialog } from "@/components/add-feed-dialog";
import { FeedIcon } from "@/components/feed-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { useResizableWidth } from "@/hooks/use-resizable-width";

type User = { name: string; email: string; role: string };
type SidebarSub = SidebarData["unfiled"][number];
type Move = { subscriptionId: string; folderId: string | null };

const UNFILED_ZONE = "unfiled";
const folderZoneId = (folderId: string) => `folder:${folderId}`;

/** lucide-react não inclui mais ícones de marca; octocat inline no lugar do pacote. */
function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56 0-.27-.01-1.17-.02-2.13-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.2.67.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function AppShell({ sidebar, user, children }: { sidebar: SidebarData; user: User; children: React.ReactNode }) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  // O menu mobile fica aberto só na rota em que foi aberto: navegar o fecha sem precisar de efeito.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const mobileOpen = openOn === pathname;
  const setMobileOpen = (open: boolean) => setOpenOn(open ? pathname : null);
  const sidebarSize = useResizableWidth("openrss:sidebar-width", { defaultWidth: 256, min: 200, max: 520 });

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        style={{ "--sidebar-w": `${sidebarSize.width}px` } as React.CSSProperties}
        className="relative hidden w-(--sidebar-w) shrink-0 border-r border-border bg-sidebar lg:flex"
      >
        <SidebarContent sidebar={sidebar} user={user} />
        <ResizeHandle label={t("resizeSidebar")} dragging={sidebarSize.dragging} {...sidebarSize.handleProps} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3 lg:hidden">
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("openMenu")}>
                <Menu />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] border-r border-border bg-sidebar shadow-card outline-none lg:hidden">
                <Dialog.Title className="sr-only">{t("mainMenu")}</Dialog.Title>
                <Dialog.Description className="sr-only">{t("mainMenuDescription")}</Dialog.Description>
                <SidebarContent sidebar={sidebar} user={user} onClose={() => setMobileOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <span className="flex items-center gap-1.5 font-semibold">
            <Rss className="size-4 text-primary" /> openRSS
          </span>
        </div>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/** Move a assinatura de pasta e recalcula listas e contadores (usado no estado otimista). */
function moveSubscription(data: SidebarData, { subscriptionId, folderId }: Move): SidebarData {
  const byTitle = (a: SidebarSub, b: SidebarSub) => a.title.localeCompare(b.title);
  const all = [...data.folders.flatMap((f) => f.subscriptions), ...data.unfiled].map((s) =>
    s.id === subscriptionId ? { ...s, folderId } : s,
  );
  const folders = data.folders.map((f) => {
    const subscriptions = all.filter((s) => s.folderId === f.id).sort(byTitle);
    return { ...f, subscriptions, unread: subscriptions.reduce((n, s) => n + s.unread, 0) };
  });
  const unfiled = all.filter((s) => !s.folderId || !data.folders.some((f) => f.id === s.folderId)).sort(byTitle);
  return { ...data, folders, unfiled };
}

function SidebarContent({ sidebar, user, onClose }: { sidebar: SidebarData; user: User; onClose?: () => void }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [refreshingAll, startRefreshAll] = useTransition();

  // Arrastar e soltar feeds entre pastas (com atualização otimista).
  const [data, applyMove] = useOptimistic(sidebar, moveSubscription);
  const [, startMove] = useTransition();
  const [dragging, setDragging] = useState<SidebarSub | null>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const folderName = (id: string | null) => (id ? (data.folders.find((f) => f.id === id)?.name ?? t("folderFallback")) : t("unfiled"));

  function clearExpandTimer() {
    if (expandTimer.current) clearTimeout(expandTimer.current);
    expandTimer.current = null;
  }

  function onDragStart(event: DragStartEvent) {
    setDragging((event.active.data.current as { sub: SidebarSub } | undefined)?.sub ?? null);
  }

  function onDragOver({ over }: DragOverEvent) {
    clearExpandTimer();
    const id = typeof over?.id === "string" && over.id.startsWith("folder:") ? over.id.slice(7) : null;
    // Pasta recolhida abre sozinha se o feed ficar um instante sobre ela.
    if (id && collapsed[id]) {
      expandTimer.current = setTimeout(() => setCollapsed((c) => ({ ...c, [id]: false })), 600);
    }
  }

  function resetDrag() {
    clearExpandTimer();
    setDragging(null);
    // Evita que o clique disparado ao soltar abra o feed.
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 80);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const sub = (active.data.current as { sub: SidebarSub } | undefined)?.sub;
    resetDrag();
    if (!sub || !over || typeof over.id !== "string") return;

    const folderId = over.id === UNFILED_ZONE ? null : over.id.slice(7);
    if ((sub.folderId ?? null) === folderId) return;

    if (folderId) setCollapsed((c) => ({ ...c, [folderId]: false }));
    startMove(async () => {
      applyMove({ subscriptionId: sub.id, folderId });
      const res = await updateSubscriptionAction(sub.id, { folderId });
      if (res.ok) toast.success(t("feedMoved", { feed: sub.title, folder: folderName(folderId) }));
      else toast.error(res.error || t("moveFeedFailed"));
    });
  }

  const draggingFromFolder = Boolean(dragging?.folderId);

  function refreshAll() {
    startRefreshAll(async () => {
      const res = await refreshAllFeedsAction();
      if (res.ok) {
        toast.success(t("feedsRefreshed", { count: res.added }));
        router.refresh();
      } else {
        toast.error(res.error || t("refreshFeedsFailed"));
      }
    });
  }

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="flex h-12 items-center justify-between px-3">
        <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight">
          <Rss className="size-4 text-primary" /> openRSS
        </Link>
        <div className="flex items-center">
          <ThemeToggle />
          {onClose && (
            <Button variant="ghost" size="icon-sm" aria-label={t("closeMenu")} onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
      </div>

      <div className="px-3 pb-2">
        <AddFeedDialog
          folders={data.folders}
          trigger={
            <Button variant="primary" className="w-full">
              <Plus /> {t("addFeed")}
            </Button>
          }
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <NavRow href="/" icon={<Sparkles className="size-4" />} label={t("nav.today")} active={isActive("/")} />
        <NavRow href="/all" icon={<Inbox className="size-4" />} label={t("nav.all")} count={data.totalUnread} active={isActive("/all")} />
        <NavRow href="/saved" icon={<Bookmark className="size-4" />} label={t("nav.saved")} count={data.savedCount} muted active={isActive("/saved")} />
        <NavRow href="/digest" icon={<Newspaper className="size-4" />} label={t("nav.digest")} active={isActive("/digest")} />
        <NavRow href="/chat" icon={<MessageSquare className="size-4" />} label={t("nav.chat")} active={isActive("/chat")} />

        <div className="mt-5 mb-1 flex items-center justify-between pr-1 pl-2">
          <p className="eyebrow">{t("feeds")}</p>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              title={t("refreshAllFeeds")}
              aria-label={t("refreshAllFeeds")}
              disabled={refreshingAll}
              onClick={refreshAll}
            >
              <RefreshCw className={cn("size-3.5", refreshingAll && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("size-6", creatingFolder && "bg-sidebar-active text-foreground")}
              title={t("newFolder")}
              aria-label={t("newFolder")}
              aria-expanded={creatingFolder}
              onClick={() => setCreatingFolder((v) => !v)}
            >
              <FolderPlus className="size-3.5" />
            </Button>
          </div>
        </div>
        {creatingFolder && <NewFolderInput onClose={() => setCreatingFolder(false)} />}

        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={resetDrag}
          accessibility={{
            screenReaderInstructions: { draggable: t("dnd.instructions") },
            announcements: {
              onDragStart: () => t("dnd.start"),
              onDragOver: ({ over }) => (over ? t("dnd.overFolder") : t("dnd.outsideFolder")),
              onDragEnd: ({ over }) => (over ? t("dnd.dropped") : t("dnd.cancelled")),
              onDragCancel: () => t("dnd.cancelled"),
            },
          }}
        >
          <div className="flex flex-col gap-1">
            {data.folders.map((folder) => {
              const open = !collapsed[folder.id];
              const active = isActive(`/folder/${folder.id}`);
              const Icon = open ? FolderOpen : FolderIcon;
              return (
                <DropZone key={folder.id} id={folderZoneId(folder.id)} disabled={dragging?.folderId === folder.id} className="flex flex-col">
                  {/* Cabeçalho da pasta: peso forte, ícone colorido e contador em pílula */}
                  <div
                    className={cn(
                      "relative flex h-8 items-center rounded-md pr-2 transition-colors duration-200 hover:bg-sidebar-active",
                      active && "bg-sidebar-active dark:before:absolute dark:before:inset-y-1.5 dark:before:left-0 dark:before:w-0.5 dark:before:rounded-full dark:before:bg-primary",
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={open ? t("collapseFolder", { name: folder.name }) : t("expandFolder", { name: folder.name })}
                      onClick={() => setCollapsed((c) => ({ ...c, [folder.id]: open }))}
                      className="flex h-full w-6 shrink-0 cursor-pointer items-center justify-center rounded-l-md text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className={cn("size-3.5 transition-transform duration-200", open && "rotate-90")} />
                    </button>
                    {renamingFolderId === folder.id ? (
                      <RenameFolderInput folder={folder} onClose={() => setRenamingFolderId(null)} />
                    ) : (
                      <>
                        <Link href={`/folder/${folder.id}`} draggable={false} className="flex h-full min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground">
                          <Icon className="size-4 shrink-0 fill-primary/15 text-primary dark:fill-ai/15 dark:text-ai" />
                          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                          {folder.unread > 0 && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-px font-mono text-[0.625rem] font-medium tabular-nums text-primary dark:bg-white/10 dark:text-foreground">
                              {folder.unread > 999 ? "999+" : folder.unread}
                            </span>
                          )}
                        </Link>
                        <button
                          type="button"
                          title={t("renameFolder")}
                          aria-label={t("renameFolderName", { name: folder.name })}
                          onClick={() => setRenamingFolderId(folder.id)}
                          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Feeds da pasta: recuados e ligados por uma linha-guia */}
                  {open && (
                    <div className="mt-0.5 mb-1 ml-3 border-l border-border pl-2">
                      {folder.subscriptions.length === 0 ? (
                        <p className="px-2 py-1 text-[0.6875rem] text-muted-foreground">{t("emptyFolder")}</p>
                      ) : (
                        folder.subscriptions.map((s) => (
                          <DraggableFeedRow key={s.id} sub={s} nested active={isActive(`/feed/${s.feedId}`)} suppressClick={suppressClick} />
                        ))
                      )}
                    </div>
                  )}
                </DropZone>
              );
            })}
          </div>

          <DropZone id={UNFILED_ZONE} disabled={!draggingFromFolder} className="mt-1 flex flex-col">
            {(data.unfiled.length > 0 && data.folders.length > 0) || draggingFromFolder ? (
              <p className="eyebrow mt-3 mb-1 px-2">{t("unfiled")}</p>
            ) : null}
            {draggingFromFolder && (
              <div className="mx-1 mb-1 flex animate-[ai-fade-in_180ms_ease-out] items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
                <FolderOutput className="size-3.5 shrink-0" />
                {t("dropToUnfile")}
              </div>
            )}
            {data.unfiled.map((s) => (
              <DraggableFeedRow key={s.id} sub={s} active={isActive(`/feed/${s.feedId}`)} suppressClick={suppressClick} />
            ))}
          </DropZone>

          <DragOverlay dropAnimation={null}>
            {dragging && (
              <div className="flex max-w-60 -rotate-1 cursor-grabbing items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground shadow-card ring-1 ring-primary/30 dark:shadow-[0_8px_30px_rgb(0_0_0/0.5)]">
                <FeedIcon src={dragging.iconUrl} />
                <span className="truncate">{dragging.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {data.folders.length === 0 && data.unfiled.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">{t("noFeeds")}</p>
        )}
      </nav>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{user.name}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">{user.email}</p>
        </div>
        <Button asChild variant="ghost" size="icon-sm" aria-label={t("viewSourceOnGithub")} title={t("viewSourceOnGithub")}>
          <a href="https://github.com/paulocarinhena/openRSS" target="_blank" rel="noopener noreferrer">
            <GithubIcon />
          </a>
        </Button>
        <Button asChild variant="ghost" size="icon-sm" aria-label={t("settings")} title={t("settings")}>
          <Link href="/settings">
            <Settings />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("signOut")}
          title={t("signOut")}
          onClick={async () => {
            await signOut();
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut />
        </Button>
      </div>
    </div>
  );
}

/** Campo inline para criar uma pasta (Enter cria, Esc cancela). */
function NewFolderInput({ onClose }: { onClose: () => void }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const value = name.trim();
    if (!value) return onClose();
    start(async () => {
      const res = await createFolderAction(value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(t("folderCreated", { name: value }));
      onClose();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mx-1 mb-2 animate-[ai-fade-in_180ms_ease-out]"
    >
      <div
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border bg-surface px-2 transition-colors duration-150 focus-within:border-ring dark:bg-secondary",
          error ? "border-destructive" : "border-border",
        )}
      >
        <FolderIcon className="size-4 shrink-0 fill-primary/15 text-primary dark:fill-ai/15 dark:text-ai" />
        <input
          autoFocus
          value={name}
          maxLength={60}
          disabled={pending}
          placeholder={t("folderNamePlaceholder")}
          aria-label={t("newFolderName")}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          onBlur={() => {
            if (!name.trim() && !pending) onClose();
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {pending ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <button
            type="submit"
            disabled={!name.trim()}
            title={t("createFolder")}
            aria-label={t("createFolder")}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
          >
            <Check className="size-3.5" />
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" aria-live="assertive" className="mt-1 px-1 text-[0.6875rem] text-destructive">{error}</p>
      ) : (
        <p className="mt-1 px-1 text-[0.625rem] text-muted-foreground">{t("folderInputHint")}</p>
      )}
    </form>
  );
}

/** Campo inline para renomear uma pasta existente (Enter salva, Esc cancela). */
function RenameFolderInput({ folder, onClose }: { folder: { id: string; name: string }; onClose: () => void }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (pending) return;
    const value = name.trim();
    if (!value || value === folder.name) return onClose();
    start(async () => {
      const res = await renameFolderAction(folder.id, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(t("folderRenamed", { name: value }));
      onClose();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex h-full min-w-0 flex-1 items-center"
    >
      <input
        autoFocus
        value={name}
        maxLength={60}
        disabled={pending}
        aria-label={t("renameFolderName", { name: folder.name })}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        onBlur={submit}
        className={cn(
          "min-w-0 flex-1 rounded border bg-surface px-1.5 text-sm font-semibold text-foreground outline-none dark:bg-secondary",
          error ? "border-destructive" : "border-border",
        )}
      />
      {pending && <Loader2 className="ml-1.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />}
    </form>
  );
}

/** Área onde um feed pode ser solto (pasta inteira ou "Sem pasta"). */
function DropZone({ id, disabled, className, children }: { id: string; disabled?: boolean; className?: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      data-drop-over={isOver || undefined}
      className={cn(
        "rounded-md transition-[background-color,box-shadow] duration-150",
        isOver && "bg-primary/5 ring-1 ring-primary/45 dark:bg-ai/10 dark:ring-ai/45",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DraggableFeedRow({
  sub,
  active,
  nested,
  suppressClick,
}: {
  sub: SidebarSub;
  active: boolean;
  nested?: boolean;
  suppressClick: React.RefObject<boolean>;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `sub:${sub.id}`, data: { sub } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      // O link nativo não pode iniciar o "arrastar" do navegador.
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={cn("touch-manipulation transition-opacity duration-150", isDragging && "opacity-35")}
    >
      <FeedRow sub={sub} active={active} nested={nested} />
    </div>
  );
}

function NavRow({
  href,
  icon,
  label,
  count,
  active,
  muted,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      draggable={false}
      className={cn(
        "relative flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors duration-200 hover:bg-sidebar-active hover:text-foreground",
        active && "bg-sidebar-active font-medium text-foreground dark:before:absolute dark:before:inset-y-1.5 dark:before:left-0 dark:before:w-0.5 dark:before:rounded-full dark:before:bg-primary",
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!count && (
        <span className={cn("font-mono text-[0.6875rem] tabular-nums", muted ? "text-muted-foreground" : active ? "text-foreground" : "text-primary dark:text-foreground")}>
          {count > 999 ? "999+" : count}
        </span>
      )}
    </Link>
  );
}

function FeedRow({ sub, active, nested }: { sub: SidebarSub; active: boolean; nested?: boolean }) {
  const t = useTranslations("shell");
  return (
    <NavRow
      className={cn(nested && "h-7 text-[0.8125rem]")}
      href={`/feed/${sub.feedId}`}
      icon={sub.hasError ? <TriangleAlert className="size-4 text-warning" aria-label={sub.lastError ?? t("feedError")} /> : <FeedIcon src={sub.iconUrl} />}
      label={sub.title}
      count={sub.unread}
      active={active}
    />
  );
}
