"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ListChecks, Loader2, SquarePen, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { deleteThreadsAction } from "@/app/actions/chat";
import { cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Thread = { id: string; title: string; updatedAt: Date };

export function ThreadList({ threads, onNavigate }: { threads: Thread[]; onNavigate?: () => void }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Ignora ids que não estão mais na lista (ex.: após excluir ou atualizar).
  const selectedIds = threads.filter((t) => selected.has(t.id)).map((t) => t.id);
  const allSelected = threads.length > 0 && selectedIds.length === threads.length;

  function exitSelection() {
    setSelecting(false);
    setSelected(new Set());
    setAnchor(null);
    setConfirming(false);
  }

  /** Marca/desmarca; com Shift aplica ao intervalo desde o último clique. */
  function toggle(index: number, range: boolean) {
    const id = threads[index].id;
    setSelected((prev) => {
      const next = new Set(prev);
      if (range && anchor !== null) {
        const select = !prev.has(id);
        for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i++) {
          if (select) next.add(threads[i].id);
          else next.delete(threads[i].id);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setAnchor(index);
    setConfirming(false);
  }

  function removeSelected() {
    const ids = selectedIds;
    setActionError(null);
    start(async () => {
      const res = await deleteThreadsAction(ids);
      if (!res.ok) {
        setActionError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(t("deleted", { count: res.count }));
      const openDeleted = ids.some((id) => pathname === `/chat/${id}`);
      exitSelection();
      if (openDeleted) router.push("/chat");
      else router.refresh();
    });
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key === "Escape" && selecting) exitSelection();
      }}
    >
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <p className="eyebrow px-1">{t("threads")}</p>
        <div className="flex items-center gap-0.5">
          {threads.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={selecting}
              title={selecting ? t("cancelSelectionShortcut") : t("selectThreads")}
              aria-label={selecting ? t("cancelSelection") : t("selectThreads")}
              onClick={() => (selecting ? exitSelection() : setSelecting(true))}
              className={cn(selecting && "bg-accent text-foreground")}
            >
              {selecting ? <X /> : <ListChecks />}
            </Button>
          )}
          <Button asChild variant="ghost" size="icon-sm" title={t("newThread")} aria-label={t("newThread")}>
            <Link href="/chat" onClick={onNavigate}>
              <SquarePen />
            </Link>
          </Button>
        </div>
      </div>

      {actionError && (
        <p role="alert" aria-live="assertive" className="mx-3 mb-2 text-xs text-destructive">
          {actionError}
        </p>
      )}

      {/* Barra de seleção: abre deslizando */}
      <div
        inert={!selecting}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          selecting ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="mx-2 mb-2 flex items-center gap-2 rounded-input border border-border bg-surface py-1 pr-1 pl-2.5 dark:bg-secondary">
            <button
              type="button"
              onClick={() => setSelected(allSelected ? new Set() : new Set(threads.map((t) => t.id)))}
              className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckBox checked={allSelected} indeterminate={selectedIds.length > 0 && !allSelected} />
              <span className="truncate tabular-nums">
                {selectedIds.length === 0 ? t("selectAll") : t("selectedCount", { count: selectedIds.length })}
              </span>
            </button>
            <div className="flex-1" />
            {confirming ? (
              <div className="flex animate-[ai-fade-in_200ms_ease-out] items-center gap-0.5">
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
                  {t("cancel")}
                </Button>
                <Button size="sm" variant="destructive" onClick={removeSelected} disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {t("confirm")}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={selectedIds.length === 0}
                onClick={() => setConfirming(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 /> {t("delete")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {threads.map((thread, index) => {
          const active = pathname === `/chat/${thread.id}`;
          const checked = selected.has(thread.id);
          return (
            <Link
              key={thread.id}
              href={`/chat/${thread.id}`}
              role={selecting ? "checkbox" : undefined}
              aria-checked={selecting ? checked : undefined}
              aria-current={active && !selecting ? "page" : undefined}
              onClick={(e) => {
                // No modo seleção (ou com Ctrl/⌘) o clique seleciona em vez de abrir.
                if (selecting || e.metaKey || e.ctrlKey) {
                  e.preventDefault();
                  if (!selecting) setSelecting(true);
                  toggle(index, e.shiftKey);
                } else {
                  onNavigate?.();
                }
              }}
              className={cn(
                "group relative flex items-center rounded-md px-2.5 py-2 transition-colors duration-200 hover:bg-accent",
                active && !selecting && "bg-accent dark:before:absolute dark:before:inset-y-2 dark:before:left-0 dark:before:w-0.5 dark:before:rounded-full dark:before:bg-primary",
                selecting && checked && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center overflow-hidden transition-[width,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  selecting ? "mr-2.5 w-4 opacity-100" : "mr-0 w-0 opacity-0",
                )}
                style={{ transitionDelay: selecting ? `${Math.min(index, 8) * 20}ms` : "0ms" }}
              >
                <CheckBox checked={checked} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    "line-clamp-2 text-sm leading-snug break-words",
                    (active && !selecting) || checked ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {thread.title || t("untitled")}
                </span>
                <span className="text-[0.625rem] text-muted-foreground" suppressHydrationWarning>
                  {relativeTime(thread.updatedAt, locale)}
                </span>
              </span>
            </Link>
          );
        })}
        {threads.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">{t("emptyList")}</p>}
      </nav>
    </div>
  );
}

function CheckBox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  const on = checked || indeterminate;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-[background-color,border-color,transform] duration-200",
        on ? "scale-100 border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-transparent",
      )}
    >
      {indeterminate && !checked ? (
        <span className="h-0.5 w-2 rounded-full bg-current" />
      ) : (
        <Check
          strokeWidth={3}
          className={cn("size-3 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]", checked ? "scale-100 opacity-100" : "scale-50 opacity-0")}
        />
      )}
    </span>
  );
}
