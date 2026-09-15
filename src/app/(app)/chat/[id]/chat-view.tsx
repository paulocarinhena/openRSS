"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Check, Copy, FileText, Loader2, RotateCcw, Search, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteThreadAction, startThreadAction } from "@/app/actions/chat";
import { cn } from "@/lib/utils";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatModelPicker, useChatModelChoice, type ChatModelChoice, type ChatProvider } from "@/components/chat/chat-model-picker";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

function requestOptions(choice: ChatModelChoice) {
  return {
    providerId: choice.providerId ?? undefined,
    model: choice.model || undefined,
    // "off" = não envia ajuste (usa o padrão do modelo).
    reasoning: choice.reasoning === "off" ? undefined : choice.reasoning,
  };
}

export function ChatView({
  threadId: initialThreadId,
  title,
  initialMessages,
  contextArticles,
  aiEnabled,
  providers,
  defaults,
}: {
  /** null = tela inicial (/chat): a primeira mensagem cria a conversa nesta mesma tela. */
  threadId: string | null;
  title: string;
  initialMessages: UIMessage[];
  contextArticles: { id: string; title: string }[];
  aiEnabled: boolean;
  providers: ChatProvider[];
  defaults: { providerId: string | null; model: string };
}) {
  const router = useRouter();
  const [choice, setChoice] = useChatModelChoice(providers, defaults);
  const [threadId, setThreadId] = useState(initialThreadId);
  // Lido no onFinish (callback criado uma vez pelo useChat), por isso em ref.
  const threadIdRef = useRef(initialThreadId);

  // threadId, provedor, modelo e raciocínio vão em cada envio (body por chamada).
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ai/chat" }), []);
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id: initialThreadId ?? "draft",
    messages: initialMessages,
    transport,
    onFinish: () => {
      // Conversa criada na tela inicial: só agora (resposta concluída e salva) a URL vira a da conversa.
      // Trocar a URL durante a resposta fazia o Next remontar o chat, e o useChat abortava a requisição.
      const id = threadIdRef.current;
      if (id && window.location.pathname !== `/chat/${id}`) window.history.replaceState(null, "", `/chat/${id}`);
      // Atualiza o título da conversa na lista lateral (gerado a partir da 1ª pergunta).
      if (title === "Nova conversa") router.refresh();
    },
  });

  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streaming = status === "submitted" || status === "streaming";
  const busy = streaming || starting;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy || !aiEnabled) return;
    setStartError(null);
    setInput("");

    let id = threadId;
    if (!id) {
      // Cria a conversa sem sair da tela (sem remontar o chat) e atualiza a URL.
      setStarting(true);
      try {
        ({ id } = await startThreadAction(contextArticles.map((a) => a.id)));
      } catch {
        setStarting(false);
        setInput(text);
        setStartError("Não foi possível criar a conversa.");
        toast.error("Não foi possível criar a conversa.");
        return;
      }
      threadIdRef.current = id;
      setThreadId(id);
      setStarting(false);
    }

    void sendMessage({ text }, { body: { threadId: id, ...requestOptions(choice) } });
  }

  const empty = messages.length === 0;
  const suggestions = contextArticles.length
    ? ["Resuma este artigo em 5 pontos", "Qual é o contexto por trás dessa notícia?", "Quais pontos são controversos ou discutíveis?", "O que mais saiu sobre esse assunto nos meus feeds?"]
    : ["O que saiu de mais importante hoje?", "Resuma as notícias de tecnologia da semana", "Quais temas mais apareceram nos meus feeds?", "Tem alguma novidade sobre inteligência artificial?"];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {threadId && (
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{title}</h1>
          <form action={deleteThreadAction.bind(null, threadId)}>
            <Button type="submit" variant="ghost" size="icon-sm" title="Excluir conversa" aria-label="Excluir conversa">
              <Trash2 />
            </Button>
          </form>
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty && !busy ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10 text-center">
            <span className="flex size-12 animate-[ai-panel-in_400ms_ease-out] items-center justify-center rounded-2xl bg-ai/12 text-ai">
              <Sparkles className="size-5" />
            </span>
            <div className="animate-[ai-fade-in_400ms_ease-out]">
              <h1 className="text-2xl font-semibold tracking-tight text-balance dark:font-normal">
                {contextArticles.length ? "O que você quer saber sobre este artigo?" : "Sobre o que você quer saber hoje?"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">A IA busca e lê as matérias dos seus feeds para responder.</p>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  disabled={!aiEnabled}
                  onClick={() => send(s)}
                  style={{ animationDelay: `${80 + i * 60}ms` }}
                  className="animate-[ai-fade-in_400ms_ease-out_both] cursor-pointer rounded-input border border-border bg-surface px-4 py-3 text-left text-sm text-muted-foreground transition-colors duration-200 hover:border-ring/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:bg-secondary/60 dark:hover:border-white/20"
                >
                  {s}
                </button>
              ))}
            </div>
            {!aiEnabled && (
              <p className="text-xs text-muted-foreground">
                Configure um provedor em{" "}
                <Link href="/settings/ai" className="underline underline-offset-2">
                  Configurações → IA
                </Link>
                .
              </p>
            )}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-4 pb-10">
            {messages.map((m, index) => {
              const isLast = index === messages.length - 1;
              return m.role === "user" ? (
                <UserMessage key={m.id} message={m} />
              ) : (
                <AssistantMessage key={m.id} message={m} streaming={isLast && status === "streaming"} />
              );
            })}

            {(status === "submitted" || starting) && (
              <div className="flex items-center gap-3">
                <Avatar active />
                <div className="flex gap-1" aria-label="Pensando">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-bounce rounded-full bg-ai/70" style={{ animationDelay: `${i * 140}ms` }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {(error || startError) && (
        <div role="alert" aria-live="assertive" className="mx-2 flex shrink-0 items-start gap-3 rounded-card border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm sm:mx-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-foreground">{startError ?? error?.message ?? "Não foi possível responder."}</p>
          {error && (
            <Button size="sm" variant="ghost" onClick={() => regenerate({ body: { threadId, ...requestOptions(choice) } })}>
              <RotateCcw /> Tentar novamente
            </Button>
          )}
        </div>
      )}

      <div className="shrink-0 bg-gradient-to-t from-background via-background to-transparent px-2 pt-2 pb-4 sm:px-4">
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={() => send(input)}
          onStop={() => stop()}
          busy={busy}
          disabled={!aiEnabled}
          autoFocus
          placeholder={aiEnabled ? "Peça qualquer coisa" : "Configure um provedor de IA em Configurações"}
          contextArticles={contextArticles}
          modelControl={<ChatModelPicker providers={providers} choice={choice} onChange={setChoice} disabled={busy} />}
        />
      </div>
    </div>
  );
}

function Avatar({ active }: { active?: boolean }) {
  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-ai/12 text-ai">
      {active && <span aria-hidden className="absolute inset-0 animate-[ai-halo_1.8s_ease-out_infinite] rounded-full bg-ai/25" />}
      <Sparkles className={cn("relative size-3.5", active && "animate-[ai-twinkle_1.6s_ease-in-out_infinite]")} />
    </span>
  );
}

function UserMessage({ message }: { message: UIMessage }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  return (
    <div className="flex animate-[ai-fade-in_220ms_ease-out] justify-end">
      <div className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-accent px-4 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground dark:bg-secondary">
        {text}
      </div>
    </div>
  );
}

type ToolPart = { type: string; state?: string; input?: { query?: string; id?: string }; output?: unknown };
type FoundArticle = { id: string; title: string; feed: string };

function AssistantMessage({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n\n").trim();
  const lastTextIndex = message.parts.map((p) => p.type).lastIndexOf("text");

  return (
    <div className="group flex animate-[ai-fade-in_260ms_ease-out] gap-3">
      <Avatar active={streaming} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-0.5">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text.trim()) return null;
            return (
              <div key={i} className={cn(streaming && i === lastTextIndex && "ai-streaming")}>
                <Markdown className="max-w-none text-[0.9375rem]">{part.text}</Markdown>
              </div>
            );
          }
          if (part.type.startsWith("tool-")) return <ToolCall key={i} part={part as ToolPart} />;
          return null;
        })}

        {!streaming && text && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Copiar resposta"
              aria-label="Copiar resposta"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  // Clipboard indisponível.
                }
              }}
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCall({ part }: { part: ToolPart }) {
  const name = part.type.slice(5);
  const done = part.state === "output-available";
  const failed = part.state === "output-error";
  const found = name === "searchArticles" && done && Array.isArray(part.output) ? (part.output as FoundArticle[]) : null;

  const label =
    name === "searchArticles"
      ? done
        ? `${found?.length ?? 0} artigos sobre “${part.input?.query ?? ""}”`
        : `Buscando “${part.input?.query ?? "…"}”`
      : done
        ? "Artigo lido"
        : "Lendo artigo";

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-2 self-start rounded-full border border-border bg-surface px-2.5 py-1 text-[0.6875rem] text-muted-foreground dark:bg-secondary",
          failed && "border-destructive/30 text-destructive",
        )}
      >
        {name === "searchArticles" ? <Search className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0" />}
        <span className="truncate">{failed ? "Falha na ferramenta" : label}</span>
        {!done && !failed && <Loader2 className="size-3 shrink-0 animate-spin text-ai" />}
        {done && <Check className="size-3 shrink-0 text-success" />}
      </span>
      {found && found.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {found.slice(0, 5).map((a) => (
            <Link
              key={a.id}
              href={`/article/${a.id}`}
              title={`${a.feed} — ${a.title}`}
              className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[0.6875rem] text-muted-foreground transition-colors duration-150 hover:border-ring/40 hover:text-foreground"
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{a.title}</span>
            </Link>
          ))}
          {found.length > 5 && <span className="self-center text-[0.6875rem] text-muted-foreground">+{found.length - 5}</span>}
        </div>
      )}
    </div>
  );
}
