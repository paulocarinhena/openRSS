"use client";

import { Loader2, MessageSquare, Send, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["keyPoints", "context", "explainTerms"] as const;

/** Perguntas rápidas sobre o artigo, sem sair do leitor (a conversa não é guardada). */
export function ArticleQA({
  articleId,
  onClose,
  onOpenChat,
  chatPending,
}: {
  articleId: string;
  onClose: () => void;
  onOpenChat: () => void;
  chatPending: boolean;
}) {
  const t = useTranslations("articles.qa");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setQuestion("");
    const history = turns;
    setTurns([...history, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId, question: q, history }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t("failed"));
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        const current = answer;
        setTurns((prev) => [...prev.slice(0, -1), { role: "assistant", content: current }]);
      }
      if (!answer.trim()) throw new Error(t("failed"));
    } catch (err) {
      if (controller.signal.aborted) return;
      setTurns(history);
      setQuestion(q);
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-ai/25 bg-ai/[0.03] p-4" aria-label={t("title")}>
      <header className="flex items-center gap-2">
        <MessageSquare className="size-4 text-ai" />
        <h2 className="flex-1 text-sm font-medium">{t("title")}</h2>
        <Button variant="ghost" size="sm" onClick={onOpenChat} disabled={chatPending}>
          {chatPending && <Loader2 className="animate-spin" />} {t("openChat")}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("close")}
          onClick={() => {
            abort.current?.abort();
            onClose();
          }}
        >
          <X />
        </Button>
      </header>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => ask(t(`suggestions.${key}`))}
              className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t(`suggestions.${key}`)}
            </button>
          ))}
        </div>
      )}

      {turns.length > 0 && (
        <div className="flex flex-col gap-3" aria-live="polite">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <p key={i} className="self-end rounded-card bg-secondary px-3 py-1.5 text-sm">
                {turn.content}
              </p>
            ) : turn.content ? (
              <div key={i} className={cn(busy && i === turns.length - 1 && "ai-streaming")}>
                <Markdown className="max-w-none text-[0.875rem]">{turn.content}</Markdown>
              </div>
            ) : (
              <Loader2 key={i} className="size-4 animate-spin text-ai" />
            ),
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          maxLength={2000}
          autoFocus
        />
        <Button type="submit" variant="primary" size="icon" aria-label={t("send")} disabled={busy || !question.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>
    </section>
  );
}
