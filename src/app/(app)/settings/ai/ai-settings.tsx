"use client";

import { Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  classifyRecentAction,
  deleteProviderAction,
  fetchModelsAction,
  listModelsAction,
  saveProviderAction,
  testProviderAction,
} from "@/app/actions/ai";
import { updateSettingsAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ModelCombobox } from "@/components/model-combobox";
import { Card, Field, Input, Switch, Textarea } from "@/components/ui/input";

type ProviderType = "openai" | "anthropic" | "openrouter" | "openai_compatible";
type Meta = Record<ProviderType, { label: string; defaultBaseUrl: string; needsBaseUrl: boolean; modelHint: string }>;

export type ProviderRow = {
  id: string;
  scope: "user" | "global";
  type: ProviderType;
  name: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
  hasKey: boolean;
  editable: boolean;
};

type Settings = {
  aiProviderId: string | null;
  aiModel: string;
  interests: string;
  classifyEnabled: boolean;
  digestEnabled: boolean;
  digestHour: number;
};

export function AiSettings({ providers, meta, isAdmin, settings }: { providers: ProviderRow[]; meta: Meta; isAdmin: boolean; settings: Settings }) {
  const t = useTranslations("ai.settings");
  const [editing, setEditing] = useState<Partial<ProviderRow> | null>(null);
  const [prefs, setPrefs] = useState(settings);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const selectedProvider = providers.find((p) => p.id === prefs.aiProviderId) ?? providers.find((p) => p.enabled);

  function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await updateSettingsAction({
        aiProviderId: prefs.aiProviderId || null,
        aiModel: prefs.aiModel || null,
        interests: prefs.interests || null,
        classifyEnabled: prefs.classifyEnabled,
        digestEnabled: prefs.digestEnabled,
        digestHour: prefs.digestHour,
      });
      if (res.ok) toast.success(t("prefsSaved"));
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">{t("providers")}</h2>
          <Button size="sm" onClick={() => setEditing({ scope: "user", type: "openai", enabled: true })}>
            <Plus /> {t("add")}
          </Button>
        </div>

        {editing && (
          <ProviderForm
            key={editing.id ?? "new"}
            initial={editing}
            meta={meta}
            isAdmin={isAdmin}
            onDone={() => setEditing(null)}
          />
        )}

        <Card className="divide-y divide-border p-0">
          {providers.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{t("noProviders")}</p>}
          {providers.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {p.name}
                  <span className="rounded-full border border-border px-1.5 text-[0.625rem] font-normal text-muted-foreground">
                    {p.scope === "global" ? t("scopeGlobalTag") : t("scopeUserTag")}
                  </span>
                  {!p.enabled && <span className="text-[0.625rem] text-warning">{t("disabled")}</span>}
                </p>
                <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">
                  {meta[p.type].label}
                  {p.defaultModel && ` · ${p.defaultModel}`}
                  {p.baseUrl && ` · ${p.baseUrl}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busyId === p.id}
                onClick={async () => {
                  setBusyId(p.id);
                  const res = await testProviderAction(p.id);
                  setBusyId(null);
                  if (res.ok) toast.success(t("connected", { ms: res.ms, reply: res.reply }));
                  else toast.error(res.error);
                }}
              >
                {busyId === p.id ? <Loader2 className="animate-spin" /> : <Zap />} {t("test")}
              </Button>
              {p.editable && (
                <>
                  <Button variant="ghost" size="icon-sm" aria-label={t("edit")} onClick={() => setEditing(p)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    onClick={() => {
                      if (!window.confirm(t("deleteConfirm", { name: p.name }))) return;
                      start(async () => {
                        const res = await deleteProviderAction(p.id);
                        if (!res.ok) toast.error(res.error);
                      });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          ))}
        </Card>
      </section>

      <form onSubmit={savePrefs} className="flex flex-col gap-3">
        <h2 className="eyebrow">{t("preferences")}</h2>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label={t("defaultProvider")}>
            <Combobox
              aria-label={t("defaultProvider")}
              value={prefs.aiProviderId ?? ""}
              onValueChange={(v) => setPrefs({ ...prefs, aiProviderId: v || null, aiModel: "" })}
              options={[
                { value: "", label: t("automatic"), description: t("automaticHint") },
                ...providers
                  .filter((p) => p.enabled)
                  .map((p) => ({
                    value: p.id,
                    label: p.name,
                    description: `${meta[p.type].label}${p.defaultModel ? ` · ${p.defaultModel}` : ""}`,
                  })),
              ]}
            />
          </Field>
          <Field label={t("model")}>
            <ModelCombobox
              value={prefs.aiModel}
              onValueChange={(v) => setPrefs({ ...prefs, aiModel: v })}
              placeholder={selectedProvider?.defaultModel ? t("providerDefault", { model: selectedProvider.defaultModel }) : undefined}
              cacheKey={selectedProvider?.id ?? null}
              unavailableReason={t("addProviderFirst")}
              load={() => listModelsAction(selectedProvider!.id)}
            />
          </Field>

          <Field className="sm:col-span-2" label={t("interests")} hint={t("interestsHint")}>
            <Textarea
              value={prefs.interests}
              onChange={(e) => setPrefs({ ...prefs, interests: e.target.value })}
              placeholder={t("interestsPlaceholder")}
            />
          </Field>

          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span>
              <span className="block font-medium">{t("classify")}</span>
              <span className="text-xs text-muted-foreground">{t("classifyHint")}</span>
            </span>
            <Switch checked={prefs.classifyEnabled} onCheckedChange={(v) => setPrefs({ ...prefs, classifyEnabled: v })} />
          </label>

          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span>
              <span className="block font-medium">{t("digest")}</span>
              <span className="text-xs text-muted-foreground">{t("digestHint")}</span>
            </span>
            <Switch checked={prefs.digestEnabled} onCheckedChange={(v) => setPrefs({ ...prefs, digestEnabled: v })} />
          </label>

          {prefs.digestEnabled && (
            <Field label={t("digestHour")}>
              <Combobox
                aria-label={t("digestHour")}
                searchable={false}
                value={String(prefs.digestHour)}
                onValueChange={(v) => setPrefs({ ...prefs, digestHour: Number(v) })}
                options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }))}
              />
            </Field>
          )}
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {t("savePrefs")}
          </Button>
          {prefs.classifyEnabled && (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await classifyRecentAction();
                  if (res.ok) toast.success(t("classified", { count: res.count }));
                  else toast.error(res.error);
                })
              }
            >
              {t("classifyRecent")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function ProviderForm({ initial, meta, isAdmin, onDone }: { initial: Partial<ProviderRow>; meta: Meta; isAdmin: boolean; onDone: () => void }) {
  const t = useTranslations("ai.form");
  const [form, setForm] = useState({
    scope: initial.scope ?? "user",
    type: initial.type ?? "openai",
    name: initial.name ?? "",
    baseUrl: initial.baseUrl ?? "",
    defaultModel: initial.defaultModel ?? "",
    enabled: initial.enabled ?? true,
    apiKey: "",
  });
  const [pending, start] = useTransition();
  const m = meta[form.type];

  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveProviderAction({ id: initial.id, ...form, name: form.name || m.label });
            if (res.ok) {
              toast.success(t("saved"));
              onDone();
            } else toast.error(res.error);
          });
        }}
      >
        <Field label={t("type")}>
          <Combobox
            aria-label={t("typeLabel")}
            value={form.type}
            disabled={Boolean(initial.id)}
            onValueChange={(v) => setForm({ ...form, type: v as ProviderType })}
            options={(Object.keys(meta) as ProviderType[]).map((type) => ({
              value: type,
              label: meta[type].label,
              description: type === "openai_compatible" ? "Ollama, LM Studio, vLLM…" : meta[type].modelHint,
            }))}
          />
        </Field>
        <Field label={t("name")}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={m.label} />
        </Field>
        <Field label="API key" hint={initial.hasKey ? t("keepKey") : form.type === "openai_compatible" ? t("keyOptional") : undefined}>
          <Input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={initial.hasKey ? "••••••••" : ""} />
        </Field>
        <Field label={m.needsBaseUrl ? t("baseUrl") : t("baseUrlOptional")}>
          <Input value={form.baseUrl} required={m.needsBaseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={m.defaultBaseUrl} />
        </Field>
        <Field label={t("defaultModel")}>
          <ModelCombobox
            aria-label={t("defaultModel")}
            value={form.defaultModel}
            onValueChange={(v) => setForm({ ...form, defaultModel: v })}
            placeholder={t("modelExample", { model: m.modelHint })}
            cacheKey={
              form.type === "openai_compatible"
                ? form.baseUrl
                  ? `${form.type}|${form.baseUrl}|${form.apiKey}`
                  : null
                : form.type === "openrouter" || form.apiKey || initial.hasKey
                  ? `${form.type}|${form.baseUrl}|${form.apiKey}`
                  : null
            }
            unavailableReason={form.type === "openai_compatible" ? t("baseUrlForModels") : t("apiKeyForModels")}
            load={() => fetchModelsAction({ providerId: initial.id, type: form.type, baseUrl: form.baseUrl, apiKey: form.apiKey })}
          />
        </Field>
        {isAdmin && !initial.id && (
          <Field label={t("scope")} hint={t("scopeHint")}>
            <Combobox
              aria-label={t("scope")}
              value={form.scope}
              onValueChange={(v) => setForm({ ...form, scope: v as "user" | "global" })}
              options={[
                { value: "user", label: t("scopeUser"), description: t("scopeUserHint") },
                { value: "global", label: t("scopeGlobal"), description: t("scopeGlobalHint") },
              ]}
            />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /> {t("enabled")}
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {t("save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
