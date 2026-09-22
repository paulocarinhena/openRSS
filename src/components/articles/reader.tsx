"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  AudioLines,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  ExternalLink,
  FileText,
  Headphones,
  Languages,
  Loader2,
  MessageSquare,
  MoveHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import type { ArticleDetail } from "@/lib/queries";
import { loadFullContent } from "@/app/actions/articles";
import { createThreadAction } from "@/app/actions/chat";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FeedIcon } from "@/components/feed-icon";
import { SummaryPanel, type SummaryMeta } from "./summary-panel";
import { READER_WIDTH_ORDER, READER_WIDTHS, useReaderWidth } from "@/hooks/use-reader-width";

function visibleTextLength(html: string | null): number {
  if (!html) return 0;
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.trim().length ?? 0;
}

export function Reader({
  article,
  aiEnabled,
  ttsEnabled,
  onClose,
  onPrev,
  onNext,
  onToggleRead,
  onToggleSaved,
  standalone,
}: {
  article: ArticleDetail;
  aiEnabled: boolean;
  ttsEnabled: boolean;
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleRead: () => void;
  onToggleSaved: () => void;
  standalone?: boolean;
}) {
  const t = useTranslations("articles");
  const locale = useLocale();
  const [fullHtml, setFullHtml] = useState<string | null>(article.fullContentHtml);
  const [showFull, setShowFull] = useState(Boolean(article.fullContentHtml));
  const [loadingFull, startFull] = useTransition();
  // Abre a matéria completa automaticamente (modo leitura da página original).
  const [autoLoading, setAutoLoading] = useState(!article.fullContentHtml && Boolean(article.url));

  useEffect(() => {
    if (article.fullContentHtml || !article.url) return;
    let cancelled = false;
    loadFullContent(article.id)
      .then((res) => {
        if (cancelled) return;
        // Só troca se a extração trouxe pelo menos tanto texto quanto o feed.
        if (res.html && visibleTextLength(res.html) >= visibleTextLength(article.contentHtml) * 0.8) {
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
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationMeta, setTranslationMeta] = useState<SummaryMeta | null>(null);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioModel, setAudioModel] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<"article" | "summary">("article");
  const [generatingAudioSource, setGeneratingAudioSource] = useState<"article" | "summary" | null>(null);
  const audioRequest = useRef<AbortController | null>(null);
  const [chatPending, startChat] = useTransition();
  const [readerWidth, setReaderWidth] = useReaderWidth();
  const widthConfig = READER_WIDTHS[readerWidth];
  const nextWidth = READER_WIDTH_ORDER[(READER_WIDTH_ORDER.indexOf(readerWidth) + 1) % READER_WIDTH_ORDER.length];

  const isRead = article.state?.isRead ?? true;
  const isSaved = article.state?.isSaved ?? false;
  const html = showFull && fullHtml ? fullHtml : article.contentHtml;

  useEffect(() => () => {
    audioRequest.current?.abort();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function generateAudio(source: "article" | "summary" = "article", force = false) {
    setReaderError(null);
    setAudioSource(source);
    setGeneratingAudioSource(source);
    audioRequest.current?.abort();
    const controller = new AbortController();
    audioRequest.current = controller;
    try {
      const response = await fetch("/api/ai/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: article.id, source, text: source === "summary" ? summary : undefined, force }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t("errors.audioFailed"));
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error(t("errors.emptyAudio"));
      setAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      setAudioModel(response.headers.get("x-tts-model"));
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : t("errors.audioFailed");
      setReaderError(message);
      toast.error(message);
    } finally {
      if (audioRequest.current === controller) {
        audioRequest.current = null;
        setGeneratingAudioSource(null);
      }
    }
  }

  function cancelAudio() {
    audioRequest.current?.abort();
    audioRequest.current = null;
    setGeneratingAudioSource(null);
  }

  async function streamAiText(
    endpoint: string,
    force: boolean,
    setText: (v: string | null) => void,
    setMeta: (v: SummaryMeta | null) => void,
    setBusy: (v: boolean) => void,
    fallbackErrorKey: "errors.summarizeFailed" | "errors.translateFailed",
  ) {
    setReaderError(null);
    setBusy(true);
    setText("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: article.id, force }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t("errors.http", { status: res.status }));
      }
      setMeta({ model: res.headers.get("x-model"), cached: res.headers.get("x-cached") === "1" });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let frame: number | null = null;
      let pendingText = "";
      const renderNextFrame = (value: string) => {
        pendingText = value;
        if (frame !== null) return;
        frame = window.requestAnimationFrame(() => {
          frame = null;
          setText(pendingText);
        });
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        renderNextFrame(text);
      }
      text += decoder.decode();
      if (frame !== null) window.cancelAnimationFrame(frame);
      setText(text);
      if (!text.trim()) throw new Error(t("errors.emptyModelResponse"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t(fallbackErrorKey);
      setText(null);
      setReaderError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const summarize = (force = false) => streamAiText("/api/ai/summarize", force, setSummary, setSummaryMeta, setSummarizing, "errors.summarizeFailed");
  const translate = (force = false) => streamAiText("/api/ai/translate", force, setTranslation, setTranslationMeta, setTranslating, "errors.translateFailed");

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
        const message = res.error ?? t("errors.loadFailed");
        setReaderError(message);
        toast.error(message);
      }
    });
  }

  return (
    <article className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-4">
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label={t("reader.back")} title={t("reader.back")} onClick={onClose}>
            <ArrowLeft />
          </Button>
        )}
        {(onPrev || onNext) && (
          <>
            <Button variant="ghost" size="icon-sm" aria-label={t("reader.previous")} title={t("reader.previous")} onClick={onPrev} disabled={!onPrev}>
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("reader.next")} title={t("reader.next")} onClick={onNext} disabled={!onNext}>
              <ChevronDown />
            </Button>
          </>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={onToggleRead} title={isRead ? t("reader.markUnread") : t("reader.markRead")} aria-label={t("reader.toggleRead")}>
          {isRead ? <CircleCheck /> : <Circle />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onToggleSaved} title={isSaved ? t("reader.unsave") : t("reader.save")} aria-label={t("reader.toggleSaved")}>
          <Bookmark className={cn(isSaved && "fill-current text-foreground")} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setReaderWidth(nextWidth)}
          title={t("reader.widthTitle", { current: t(`readerWidth.${readerWidth}`), next: t(`readerWidth.${nextWidth}`).toLowerCase() })}
          aria-label={t("reader.widthLabel", { current: t(`readerWidth.${readerWidth}`) })}
          className="hidden md:inline-flex"
        >
          <MoveHorizontal className={cn("transition-transform duration-300", readerWidth === "wide" && "scale-x-125", readerWidth === "narrow" && "scale-x-75")} />
        </Button>
        {article.url && (
          <Button variant="ghost" size="icon-sm" onClick={toggleFull} title={showFull ? t("reader.feedContent") : t("reader.loadFull")} aria-label={t("reader.fullArticle")} disabled={loadingFull}>
            {loadingFull ? <Loader2 className="animate-spin" /> : <FileText className={cn(showFull && "text-foreground")} />}
          </Button>
        )}
        {article.url && (
          <Button asChild variant="ghost" size="icon-sm" title={t("reader.openOriginalShortcut")} aria-label={t("openOriginal")}>
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
                {article.publishedAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
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
              <Button size="sm" onClick={() => summarize(false)} disabled={!aiEnabled || summarizing} title={aiEnabled ? undefined : t("reader.configureAi")}>
                <Sparkles className={cn("text-ai", summarizing && "animate-[ai-twinkle_1.6s_ease-in-out_infinite]")} />
                {summarizing ? t("reader.summarizing") : t("reader.summarize")}
              </Button>
              <Button size="sm" onClick={() => translate(false)} disabled={!aiEnabled || translating} title={aiEnabled ? undefined : t("reader.configureAi")}>
                {translating ? <Loader2 className="animate-spin text-ai" /> : <Languages className="text-ai" />}
                {translating ? t("reader.translating") : t("reader.translate")}
              </Button>
              <Button
                size="sm"
                disabled={!aiEnabled || chatPending}
                onClick={() => startChat(() => createThreadAction([article.id]))}
              >
                {chatPending ? <Loader2 className="animate-spin" /> : <MessageSquare className="text-ai" />}
                {t("reader.askAi")}
              </Button>
              <Button
                size="sm"
                disabled={!ttsEnabled}
                title={!ttsEnabled ? t("reader.configureTts") : generatingAudioSource === "article" ? t("reader.cancelAudio") : undefined}
                aria-label={generatingAudioSource === "article" ? t("reader.cancelAudio") : t("reader.generateAudio")}
                onClick={() => generatingAudioSource === "article" ? cancelAudio() : generateAudio("article")}
                className={cn(
                  "transition-[color,background-color,border-color,box-shadow] duration-300",
                  generatingAudioSource === "article" && "border-ai/30 bg-ai/10 text-ai shadow-[0_0_0_3px_color-mix(in_oklab,var(--ai)_10%,transparent),0_8px_24px_color-mix(in_oklab,var(--ai)_12%,transparent)] hover:bg-ai/15",
                )}
              >
                {generatingAudioSource === "article" ? (
                  <>
                    <span className="relative flex size-4 items-center justify-center">
                      <span aria-hidden className="absolute -inset-1 animate-[ai-halo_1.8s_ease-out_infinite] rounded-full bg-ai/20" />
                      <AudioLines className="relative animate-[ai-twinkle_900ms_ease-in-out_infinite] text-ai" />
                    </span>
                    <span>{t("reader.generatingAudio")}</span>
                    <span className="ml-1 flex items-center gap-1 border-l border-ai/25 pl-2 text-[0.6875rem] font-semibold">
                      <X className="size-3" />
                      {t("reader.cancel")}
                    </span>
                  </>
                ) : (
                  <><Headphones className="text-ai" />{t("reader.generateAudio")}</>
                )}
              </Button>
            </div>
          </header>

          {audioUrl && (
            <section className="ai-panel rounded-card border border-ai/25 bg-[color-mix(in_oklab,var(--ai)_5%,var(--surface))] p-4" aria-label={t(audioSource === "summary" ? "audio.summaryTitle" : "audio.title")}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-ai/12 text-ai"><Headphones className="size-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{t(audioSource === "summary" ? "audio.summaryTitle" : "audio.title")}</p>
                  {audioModel && <p className="truncate font-mono text-[0.625rem] text-muted-foreground">{audioModel}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => generateAudio(audioSource, true)}>{t("audio.regenerate")}</Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("audio.close")} onClick={() => setAudioUrl((current) => { if (current) URL.revokeObjectURL(current); return null; })}>×</Button>
              </div>
              <audio className="w-full" controls preload="metadata" src={audioUrl}>{t("audio.unsupported")}</audio>
            </section>
          )}

          {summary !== null && (
            <SummaryPanel
              text={summary}
              streaming={summarizing}
              meta={summaryMeta}
              onRegenerate={() => summarize(true)}
              onClose={() => setSummary(null)}
              onGenerateAudio={ttsEnabled ? () => generateAudio("summary") : undefined}
              onCancelAudio={cancelAudio}
              audioBusy={generatingAudioSource === "summary"}
            />
          )}

          {translation !== null && (
            <SummaryPanel
              namespace="articles.translate"
              format="html"
              text={translation}
              streaming={translating}
              meta={translationMeta}
              onRegenerate={() => translate(true)}
              onClose={() => setTranslation(null)}
            />
          )}

          {readerError && (
            <p role="alert" aria-live="assertive" className="flex items-center gap-2 rounded-input border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {readerError}
            </p>
          )}

          {autoLoading && (
            <p className="flex items-center gap-2 rounded-input border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {t("reader.loadingFull")}
            </p>
          )}

          {html ? (
            <div className={cn("prose-reader transition-opacity duration-200", autoLoading && "opacity-60")} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("reader.noContent")}{" "}
              {article.url && (
                <button type="button" className="cursor-pointer underline underline-offset-2" onClick={toggleFull}>
                  {t("reader.loadFull")}
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
