"use client";

import { Popover } from "radix-ui";
import { Brain, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { listModelsAction } from "@/app/actions/ai";
import { cn } from "@/lib/utils";
import { ModelCombobox } from "@/components/model-combobox";
import { Combobox } from "@/components/ui/combobox";

export type Reasoning = "off" | "low" | "medium" | "high" | "xhigh";
export type ChatModelChoice = { providerId: string | null; model: string; reasoning: Reasoning };
export type ChatProvider = { id: string; name: string; type: string; defaultModel: string | null };

/** Níveis no estilo da OpenAI. "off" = não envia ajuste (padrão do modelo). */
export const REASONING: { value: Reasoning; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Sem ajuste de raciocínio — usa o padrão do modelo." },
  { value: "low", label: "Low", hint: "Pensa pouco e responde rápido." },
  { value: "medium", label: "Medium", hint: "Equilíbrio entre velocidade e qualidade." },
  { value: "high", label: "High", hint: "Pensa mais antes de responder." },
  { value: "xhigh", label: "XHigh", hint: "Raciocínio máximo — mais lento e mais caro." },
];

const KEY = "openrss:chat-model";

function subscribe(callback: () => void) {
  window.addEventListener(KEY, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(KEY, callback);
    window.removeEventListener("storage", callback);
  };
}

function readRaw() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Escolha de modelo/raciocínio do chat, lembrada no navegador. */
export function useChatModelChoice(providers: ChatProvider[], defaults: { providerId: string | null; model: string }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);

  const choice = useMemo<ChatModelChoice>(() => {
    const fallbackProvider = providers.find((p) => p.id === defaults.providerId) ?? providers[0] ?? null;
    const fallback: ChatModelChoice = {
      providerId: fallbackProvider?.id ?? null,
      model: fallbackProvider?.id === defaults.providerId ? defaults.model : "",
      reasoning: "off",
    };
    try {
      const stored = raw ? (JSON.parse(raw) as { providerId?: string; model?: string; reasoning?: string }) : null;
      if (!stored) return fallback;
      const valid = providers.some((p) => p.id === stored.providerId);
      const reasoning = REASONING.find((r) => r.value === stored.reasoning)?.value ?? "off"; // "default" antigo → off
      return {
        providerId: valid ? stored.providerId! : fallback.providerId,
        model: valid && typeof stored.model === "string" ? stored.model : fallback.model,
        reasoning,
      };
    } catch {
      return fallback;
    }
  }, [raw, providers, defaults.providerId, defaults.model]);

  const setChoice = useCallback((next: ChatModelChoice) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Sem armazenamento: a escolha não persiste.
    }
    window.dispatchEvent(new Event(KEY));
  }, []);

  return [choice, setChoice] as const;
}

export function ChatModelPicker({
  providers,
  choice,
  onChange,
  disabled,
}: {
  providers: ChatProvider[];
  choice: ChatModelChoice;
  onChange: (choice: ChatModelChoice) => void;
  disabled?: boolean;
}) {
  const provider = providers.find((p) => p.id === choice.providerId) ?? null;
  const modelLabel = choice.model || provider?.defaultModel || "Modelo";
  const current = REASONING.find((r) => r.value === choice.reasoning) ?? REASONING[0];

  return (
    <Popover.Root>
      <Popover.Trigger asChild disabled={disabled || providers.length === 0}>
        <button
          type="button"
          className="group flex h-8 max-w-[16rem] min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors duration-200 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-accent"
        >
          <span className="truncate font-semibold text-foreground">{modelLabel}</span>
          <span key={current.value} className="shrink-0 animate-[effort-label-in_260ms_cubic-bezier(0.2,0.8,0.2,1)] text-muted-foreground">
            {current.label}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="z-50 flex w-[min(24rem,calc(100vw-2rem))] animate-[combobox-in_140ms_ease-out] flex-col gap-4 rounded-card border border-border bg-surface p-4 text-surface-foreground shadow-card"
        >
          {providers.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="eyebrow">Provedor</p>
              <Combobox
                aria-label="Provedor"
                value={choice.providerId ?? ""}
                onValueChange={(id) => onChange({ ...choice, providerId: id, model: "" })}
                options={providers.map((p) => ({ value: p.id, label: p.name, description: p.defaultModel ?? undefined }))}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="eyebrow">Modelo</p>
            <ModelCombobox
              value={choice.model}
              onValueChange={(model) => onChange({ ...choice, model })}
              placeholder={provider?.defaultModel ? `Padrão: ${provider.defaultModel}` : "Selecione ou digite um modelo"}
              cacheKey={provider?.id ?? null}
              unavailableReason="Nenhum provedor configurado."
              load={() => listModelsAction(provider!.id)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="eyebrow flex items-center gap-1.5">
              <Brain className="size-3" /> Raciocínio
            </p>
            <EffortSelector value={choice.reasoning} onChange={(reasoning) => onChange({ ...choice, reasoning })} />
            <p key={current.value} className="min-h-4 animate-[ai-fade-in_220ms_ease-out] text-[0.6875rem] text-muted-foreground">
              {current.hint}
            </p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Controle segmentado com um indicador que desliza até a opção escolhida. */
function EffortSelector({ value, onChange }: { value: Reasoning; onChange: (value: Reasoning) => void }) {
  const index = Math.max(0, REASONING.findIndex((r) => r.value === value));
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const previousIndex = useRef(index);

  // Desliza o indicador da posição anterior até a nova, esticando no meio do caminho.
  useEffect(() => {
    const el = indicatorRef.current;
    const from = previousIndex.current;
    previousIndex.current = index;
    if (!el || from === index || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const distance = Math.abs(index - from);
    el.animate(
      [
        { transform: `translateX(${from * 100}%) scaleX(1)` },
        { transform: `translateX(${((from + index) / 2) * 100}%) scaleX(${1 + Math.min(0.6, 0.22 * distance)})`, offset: 0.4 },
        { transform: `translateX(${index * 100}%) scaleX(0.96)`, offset: 0.82 },
        { transform: `translateX(${index * 100}%) scaleX(1)` },
      ],
      { duration: 420 + distance * 60, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [index]);

  function onKeyDown(e: React.KeyboardEvent) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = REASONING[Math.min(REASONING.length - 1, Math.max(0, index + delta))];
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Nível de raciocínio" onKeyDown={onKeyDown} className="relative grid grid-cols-5 rounded-input bg-muted p-1">
      {/* Indicador deslizante */}
      <span
        ref={indicatorRef}
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-md bg-ai/15 shadow-[0_0_18px_-6px_var(--ai)] ring-1 ring-ai/45 will-change-transform"
        style={{ width: `calc((100% - 0.5rem) / ${REASONING.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {REASONING.map((r, i) => {
        const active = i === index;
        return (
          <button
            key={r.value}
            type="button"
            role="radio"
            data-value={r.value}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={r.hint}
            onClick={() => onChange(r.value)}
            className={cn(
              "relative z-10 flex h-8 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md text-xs outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-ring",
              active ? "font-semibold text-ai" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{r.label}</span>
            {/* Barrinhas de intensidade: acendem até o nível escolhido */}
            <span aria-hidden className="flex h-1 items-end gap-px">
              {[1, 2, 3, 4].map((bar) => (
                <span
                  key={bar}
                  className={cn(
                    "w-1 rounded-full transition-[background-color,height] duration-300",
                    bar <= i ? (active ? "bg-ai" : "bg-muted-foreground/50") : "bg-muted-foreground/20",
                  )}
                  style={{ height: `${2 + bar}px`, transitionDelay: active ? `${bar * 40}ms` : "0ms" }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
