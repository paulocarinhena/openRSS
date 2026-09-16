"use client";

import { Check, Copy, Languages, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn, stripHtml } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

export type SummaryMeta = { model: string | null; cached: boolean };

const SKELETON = ["94%", "82%", "88%", "62%"];

export function SummaryPanel({
  text,
  streaming,
  meta,
  onRegenerate,
  onClose,
  namespace = "articles.summary",
  format = "markdown",
}: {
  text: string;
  streaming: boolean;
  meta: SummaryMeta | null;
  onRegenerate: () => void;
  onClose: () => void;
  namespace?: "articles.summary" | "articles.translate";
  format?: "markdown" | "html";
}) {
  const t = useTranslations(namespace);
  const ref = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const Icon = namespace === "articles.translate" ? Languages : Sparkles;

  // Traz o painel para a vista quando ele aparece.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(format === "html" ? stripHtml(text) : text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  const status = streaming ? (text ? t("writing") : t("reading")) : t("title");

  return (
    <section
      ref={ref}
      aria-live="polite"
      aria-busy={streaming}
      className={cn(
        "ai-panel relative scroll-mt-4 overflow-hidden rounded-card border border-ai/25 bg-[color-mix(in_oklab,var(--ai)_5%,var(--surface))]",
        "animate-[ai-panel-in_360ms_cubic-bezier(0.2,0.8,0.2,1)]",
      )}
    >
      {/* Barra de progresso indeterminada enquanto gera */}
      <div className={cn("absolute inset-x-0 top-0 h-0.5 overflow-hidden transition-opacity duration-500", streaming ? "opacity-100" : "opacity-0")}>
        <div className="h-full w-2/5 animate-[ai-progress_1.5s_cubic-bezier(0.4,0,0.2,1)_infinite] rounded-full bg-ai" />
      </div>

      <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-ai/12 text-ai">
          {streaming && <span aria-hidden className="absolute inset-0 animate-[ai-halo_1.8s_ease-out_infinite] rounded-full bg-ai/25" />}
          <Icon className={cn("relative size-3.5", streaming && "animate-[ai-twinkle_1.6s_ease-in-out_infinite]")} />
        </span>

        <div className="min-w-0 flex-1">
          <p key={status} className="animate-[ai-fade-in_240ms_ease-out] text-xs font-semibold tracking-tight text-foreground">
            {status}
          </p>
          {!streaming && meta?.model && (
            <p className="animate-[ai-fade-in_240ms_ease-out] truncate font-mono text-[0.625rem] text-muted-foreground">
              {meta.model}
              {meta.cached && ` · ${t("cached")}`}
            </p>
          )}
        </div>

        {!streaming && text && (
          <div className="flex animate-[ai-fade-in_240ms_ease-out] items-center">
            <Button variant="ghost" size="icon-sm" title={t("copy")} aria-label={t("copySummary")} onClick={copy}>
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
            <Button variant="ghost" size="icon-sm" title={t("regenerate")} aria-label={t("regenerate")} onClick={onRegenerate}>
              <RotateCcw />
            </Button>
            <Button variant="ghost" size="icon-sm" title={t("close")} aria-label={t("closeSummary")} onClick={onClose}>
              <X />
            </Button>
          </div>
        )}
      </header>

      <div className="px-4 pb-4">
        {text ? (
          format === "html" ? (
            <div
              className={cn("prose-reader animate-[ai-fade-in_300ms_ease-out]", streaming && "ai-streaming")}
              dangerouslySetInnerHTML={{ __html: text }}
            />
          ) : (
            <div className={cn("animate-[ai-fade-in_300ms_ease-out]", streaming && "ai-streaming")}>
              <Markdown className="max-w-none text-[0.875rem] [&_li]:my-1 [&_ul]:my-2">{text}</Markdown>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2.5 py-1.5" aria-hidden>
            {SKELETON.map((width, i) => (
              <div key={i} className="ai-shimmer h-2.5 rounded-full" style={{ width, animationDelay: `${i * 140}ms` }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
