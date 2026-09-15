"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  MoveHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { ArticleDetail } from "@/lib/queries";
import { loadFullContent } from "@/app/actions/articles";
import { createThreadAction } from "@/app/actions/chat";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FeedIcon } from "@/components/feed-icon";
import { SummaryPanel, type SummaryMeta } from "./summary-panel";
import { READER_WIDTH_ORDER, READER_WIDTHS, useReaderWidth } from "@/hooks/use-reader-width";

export function Reader({
  article,
  aiEnabled,
  onClose,
  onPrev,
  onNext,
  onToggleRead,
  onToggleSaved,
  standalone,
}: {
  article: ArticleDetail;
  aiEnabled: boolean;
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleRead: () => void;
  onToggleSaved: () => void;
  standalone?: boolean;
}) {
  const [fullHtml, setFullHtml] = useState<string | null>(article.fullContentHtml);
  const [showFull, setShowFull] = useState(Boolean(article.fullContentHtml));
  const [loadingFull, startFull] = useTransition();
  // Abre a matéria completa automaticamente (modo leitura da página original).
  const [autoLoading, setAutoLoading] = useState(!article.fullContentHtml && Boolean(article.url));

  useEffect(() => {
    if (article.fullContentHtml || !article.url) return;
    let cancelled = false;
    const textLength = (h: string | null) => (h ?? "").replace(/<[^>]+>/g, "").trim().length;
    loadFullContent(article.id)
      .then((res) => {
        if (cancelled) return;
        // Só troca se a extração trouxe pelo menos tanto texto quanto o feed.
        if (res.html && textLength(res.html) >= textLength(article.contentHtml) * 0.8) {
          setFullHtml(res.html);
          setShowFull(true);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setAutoLoading(false));
    return () => {
      cancelled = true;
    };
  }, [article.id, article.url, article.fullContentHtml, article.contentHtml]);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryMeta, setSummaryMeta] = useState<SummaryMeta | null>(null);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [chatPending, startChat] = useTransition();
  const [readerWidth, setReaderWidth] = useReaderWidth();
  const widthConfig = READER_WIDTHS[readerWidth];
  const nextWidth = READER_WIDTH_ORDER[(READER_WIDTH_ORDER.indexOf(readerWidth) + 1) % READER_WIDTH_ORDER.length];

  const isRead = article.state?.isRead ?? true;
  const isSaved = article.state?.isSaved ?? false;
  const html = showFull && fullHtml ? fullHtml : article.contentHtml;

  async function summarize(force = false) {
    setReaderError(null);
    setSummarizing(true);
    setSummary("");
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: article.id, force }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Falha (HTTP ${res.status})`);
      }
      setSummaryMeta({ model: res.headers.get("x-model"), cached: res.headers.get("x-cached") === "1" });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setSummary(text);
      }
      if (!text.trim()) throw new Error("O modelo não retornou conteúdo.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao resumir.";
      setSummary(null);
      setReaderError(message);
      toast.error(message);
    } finally {
      setSummarizing(false);
    }
  }

  function toggleFull() {
    setReaderError(null);
    if (showFull) return setShowFull(false);
    if (fullHtml) return setShowFull(true);
    startFull(async () => {
      const res = await loadFullContent(article.id);
      if (res.html) {
        setFullHtml(res.html);
        setShowFull(true);
      } else {
        const message = res.error ?? "Não foi possível carregar.";
        setReaderError(message);
        toast.error(message);
      }
    });
  }

  return (
    <article className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-4">
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label="Voltar (Esc)" title="Voltar (Esc)" onClick={onClose}>
            <ArrowLeft />
          </Button>
        )}
        {(onPrev || onNext) && (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="Anterior (k)" title="Anterior (k)" onClick={onPrev} disabled={!onPrev}>
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Próximo (j)" title="Próximo (j)" onClick={onNext} disabled={!onNext}>
              <ChevronDown />
            </Button>
          </>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={onToggleRead} title={isRead ? "Marcar como não lido (m)" : "Marcar como lido (m)"} aria-label="Alternar lido">
          {isRead ? <CircleCheck /> : <Circle />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onToggleSaved} title={isSaved ? "Remover dos salvos (s)" : "Salvar (s)"} aria-label="Alternar salvo">
          <Bookmark className={cn(isSaved && "fill-current text-foreground")} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setReaderWidth(nextWidth)}
          title={`Largura do texto: ${widthConfig.label} (clique para ${READER_WIDTHS[nextWidth].label.toLowerCase()})`}
          aria-label={`Largura do texto: ${widthConfig.label}`}
          className="hidden md:inline-flex"
        >
          <MoveHorizontal className={cn("transition-transform duration-300", readerWidth === "wide" && "scale-x-125", readerWidth === "narrow" && "scale-x-75")} />
        </Button>
        {article.url && (
          <Button variant="ghost" size="icon-sm" onClick={toggleFull} title={showFull ? "Conteúdo do feed" : "Carregar artigo completo"} aria-label="Artigo completo" disabled={loadingFull}>
            {loadingFull ? <Loader2 className="animate-spin" /> : <FileText className={cn(showFull && "text-foreground")} />}
          </Button>
        )}
        {article.url && (
          <Button asChild variant="ghost" size="icon-sm" title="Abrir original (o)" aria-label="Abrir original">
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
            </a>
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          style={{ maxWidth: widthConfig.maxWidth, "--reader-font-size": widthConfig.fontSize } as React.CSSProperties}
          className={cn("mx-auto flex w-full flex-col gap-5 px-5 py-6 transition-[max-width] duration-300 ease-out sm:px-8", standalone && "py-10")}
        >
          <header className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FeedIcon src={article.feed.iconUrl} />
              <span className="truncate">{article.feed.title}</span>
              {article.author && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{article.author}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <time dateTime={article.publishedAt.toISOString()} suppressHydrationWarning>
                {article.publishedAt.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </div>
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance lg:text-[1.875rem] dark:font-normal dark:tracking-[-0.02em]">
              {article.url ? (
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline hover:underline-offset-4">
                  {article.title}
                </a>
              ) : (
                article.title
              )}
            </h1>
            {article.state?.priorityReason && (
              <p className="flex items-center gap-1.5 text-xs text-ai">
                <Sparkles className="size-3.5" />
                <span className="font-mono">{article.state.priorityScore}</span>
                <span className="text-muted-foreground">{article.state.priorityReason}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => summarize(false)} disabled={!aiEnabled || summarizing} title={aiEnabled ? undefined : "Configure um provedor de IA em Configurações"}>
                <Sparkles className={cn("text-ai", summarizing && "animate-[ai-twinkle_1.6s_ease-in-out_infinite]")} />
                {summarizing ? "Resumindo…" : "Resumir"}
              </Button>
              <Button
                size="sm"
                disabled={!aiEnabled || chatPending}
                onClick={() => startChat(() => createThreadAction([article.id]))}
              >
                {chatPending ? <Loader2 className="animate-spin" /> : <MessageSquare className="text-ai" />}
                Perguntar à IA
              </Button>
            </div>
          </header>

          {summary !== null && (
            <SummaryPanel
              text={summary}
              streaming={summarizing}
              meta={summaryMeta}
              onRegenerate={() => summarize(true)}
              onClose={() => setSummary(null)}
            />
          )}

          {readerError && (
            <p role="alert" aria-live="assertive" className="flex items-center gap-2 rounded-input border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {readerError}
            </p>
          )}

          {autoLoading && (
            <p className="flex items-center gap-2 rounded-input border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Carregando a matéria completa…
            </p>
          )}

          {html ? (
            <div className={cn("prose-reader transition-opacity duration-200", autoLoading && "opacity-60")} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Este item não tem conteúdo no feed.{" "}
              {article.url && (
                <button type="button" className="cursor-pointer underline underline-offset-2" onClick={toggleFull}>
                  Carregar artigo completo
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
