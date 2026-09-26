"use client";

import { Loader2, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setEmbeddingConfigAction } from "@/app/actions/embeddings";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Card, Field, Input } from "@/components/ui/input";

type Provider = { id: string; name: string; type: string };

const MODEL_HINT: Record<string, string> = {
  openai: "text-embedding-3-small",
  openai_compatible: "nomic-embed-text",
  openrouter: "openai/text-embedding-3-small",
};

/** Admin: provedor e modelo de embeddings da busca semântica. */
export function SemanticSearchSettings({
  providers,
  current,
  status,
}: {
  providers: Provider[];
  current: { providerId: string | null; model: string };
  status: { indexed: number; total: number } | null;
}) {
  const t = useTranslations("semantic");
  const [providerId, setProviderId] = useState(current.providerId ?? "");
  const [model, setModel] = useState(current.model);
  const [pending, start] = useTransition();
  const selected = providers.find((p) => p.id === providerId);

  function save(enable: boolean) {
    start(async () => {
      const res = await setEmbeddingConfigAction(enable ? { providerId, model } : { providerId: null, model: "" });
      if (!res.ok) return void toast.error(res.error);
      toast.success(enable ? t("enabled") : t("disabled"));
      if (!enable) {
        setProviderId("");
        setModel("");
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">{t("title")}</h2>
      <Card className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        {providers.length === 0 ? (
          <p className="text-xs text-warning">{t("noProviders")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("provider")}>
              <Combobox
                aria-label={t("provider")}
                value={providerId}
                onValueChange={(v) => {
                  setProviderId(v);
                  const type = providers.find((p) => p.id === v)?.type;
                  if (!model && type) setModel(MODEL_HINT[type] ?? "");
                }}
                placeholder={t("choose")}
                options={providers.map((p) => ({ value: p.id, label: p.name, description: p.type }))}
              />
            </Field>
            <Field label={t("model")} hint={selected ? t("modelHint", { example: MODEL_HINT[selected.type] ?? "" }) : undefined}>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={selected ? MODEL_HINT[selected.type] : ""} />
            </Field>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={pending || !providerId || !model.trim()} onClick={() => save(true)}>
            {pending ? <Loader2 className="animate-spin" /> : <Search />} {current.providerId ? t("update") : t("enable")}
          </Button>
          {current.providerId && (
            <Button variant="ghost" disabled={pending} onClick={() => save(false)}>
              {t("disable")}
            </Button>
          )}
          {status && (
            <span className="text-xs text-muted-foreground">{t("status", { indexed: status.indexed, total: status.total })}</span>
          )}
        </div>
      </Card>
    </section>
  );
}
