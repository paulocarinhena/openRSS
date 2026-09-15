"use client";

import { RefreshCw } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";

export type ModelInfo = { id: string; name?: string };
type LoadResult = { ok: true; models: ModelInfo[] } | { ok: false; error: string };

/**
 * Combobox de modelos que busca a lista na API do provedor ao abrir.
 * `cacheKey` identifica a origem (tipo/baseUrl/chave ou id do provedor): quando muda, a lista é recarregada.
 * `cacheKey` nulo = não dá para carregar ainda (`unavailableReason` explica o motivo).
 */
export function ModelCombobox({
  value,
  onValueChange,
  cacheKey,
  load,
  unavailableReason,
  placeholder,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  cacheKey: string | null;
  load: () => Promise<LoadResult>;
  unavailableReason?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("ai.models");
  const [result, setResult] = useState<{ key: string; models?: ModelInfo[]; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const request = useRef(0);
  const current = cacheKey && result?.key === cacheKey ? result : null;

  function fetchModels(force = false) {
    if (!cacheKey || (!force && current)) return;
    const key = cacheKey;
    const requestId = ++request.current;
    start(async () => {
      const res = await load();
      if (request.current !== requestId) return;
      setResult(res.ok ? { key, models: res.models } : { key, error: res.error });
    });
  }

  const models = current?.models ?? [];
  const status = !cacheKey
    ? unavailableReason
    : pending
      ? t("loading")
      : current?.error
        ? current.error
        : current?.models
          ? t("available", { count: current.models.length })
          : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <Combobox
          id={id}
          className="flex-1"
          aria-label={ariaLabel ?? t("label")}
          allowCustom
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          loading={pending}
          loadingText={t("loading")}
          placeholder={placeholder ?? t("placeholder")}
          searchPlaceholder={t("searchPlaceholder")}
          emptyText={current?.error ?? (cacheKey ? t("noneFound") : unavailableReason ?? t("typeName"))}
          onOpenChange={(open) => open && fetchModels()}
          options={models.map((m) => ({ value: m.id, label: m.id, description: m.name }))}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={t("reload")}
          aria-label={t("reload")}
          disabled={!cacheKey || pending || disabled}
          onClick={() => fetchModels(true)}
        >
          <RefreshCw className={cn(pending && "animate-spin")} />
        </Button>
      </div>
      {status && <p className={cn("text-[0.6875rem] text-muted-foreground", current?.error && "text-destructive")}>{status}</p>}
    </div>
  );
}
