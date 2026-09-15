"use client";

import { ArrowUp, FileText, Rss, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  disabled,
  placeholder,
  contextArticles,
  modelControl,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  contextArticles: { id: string; title: string }[];
  modelControl?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const t = useTranslations("chat.composer");
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled;

  // Volta ao tamanho inicial quando o campo é limpo (após enviar).
  useEffect(() => {
    if (!value && ref.current) ref.current.style.height = "";
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend && !busy) onSubmit();
      }}
      className="mx-auto w-full max-w-3xl"
    >
      {/* Aba de contexto presa ao topo do compositor */}
      <div className="mx-4 flex min-w-0 items-center gap-2 overflow-x-auto rounded-t-[1rem] border border-b-0 border-border bg-background px-3 py-1.5 text-xs [scrollbar-width:none] dark:bg-[color-mix(in_oklab,var(--secondary)_60%,var(--background))]">
        {contextArticles.length > 0 ? (
          contextArticles.map((a) => (
            <span key={a.id} className="flex max-w-[18rem] shrink-0 items-center gap-1.5 font-medium text-foreground">
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{a.title}</span>
            </span>
          ))
        ) : (
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Rss className="size-3.5 text-muted-foreground" />
            {t("allFeeds")}
          </span>
        )}
      </div>

      <div
        className={cn(
          "rounded-[1.35rem] border border-border bg-surface shadow-card transition-[border-color,box-shadow] duration-200",
          "focus-within:border-ring/50 dark:bg-secondary dark:focus-within:border-white/20",
          disabled && "opacity-70",
        )}
      >
        <textarea
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          disabled={disabled}
          rows={3}
          placeholder={placeholder ?? t("placeholder")}
          aria-label={t("message")}
          onChange={(e) => {
            onChange(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend && !busy) onSubmit();
            }
          }}
          className="block max-h-[260px] min-h-[5.5rem] w-full resize-none bg-transparent px-5 pt-4 pb-1 text-[0.9375rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />

        <div className="flex items-center gap-2 px-3 pt-1 pb-3">
          <p className="hidden pl-2 text-[0.6875rem] text-muted-foreground sm:block">
            <kbd className="font-sans">↵</kbd> {t("sendHint")} · <kbd className="font-sans">⇧ ↵</kbd> {t("newLineHint")}
          </p>
          <div className="flex-1" />
          {modelControl}
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t("stop")}
              title={t("stop")}
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t("send")}
              title={t("send")}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-200",
                canSend
                  ? "cursor-pointer bg-primary text-primary-foreground hover:scale-105 active:scale-95"
                  : "cursor-not-allowed bg-muted text-muted-foreground dark:bg-white/10",
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
