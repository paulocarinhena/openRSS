"use client";

import { Headphones, Loader2, Pencil, Plus, ShieldCheck, Trash2, Zap } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  classifyRecentAction,
  clearSystemDefaultAction,
  deleteProviderAction,
  fetchModelsAction,
  listModelsAction,
  saveProviderAction,
  setSystemDefaultAction,
  testProviderAction,
} from "@/app/actions/ai";
import { updateSettingsAction } from "@/app/actions/settings";
import { deleteTtsProviderAction, saveTtsProviderAction, testTtsProviderAction } from "@/app/actions/tts";
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
  isSystemDefault: boolean;
};

export type TtsProviderRow = {
  id: string;
  scope: "user" | "global";
  name: string;
  baseUrl: string;
  model: string;
  voice: string;
  responseFormat: string;
  enabled: boolean;
  hasKey: boolean;
  editable: boolean;
};

type Settings = {
  aiProviderId: string | null;
  aiModel: string;
  ttsProviderId: string | null;
  interests: string;
  classifyEnabled: boolean;
  digestEnabled: boolean;
  digestHour: number;
};

export function AiSettings({
  providers,
  ttsProviders,
  meta,
  isAdmin,
  settings,
  systemDefaultModel,
}: {
  providers: ProviderRow[];
  ttsProviders: TtsProviderRow[];
  meta: Meta;
  isAdmin: boolean;
  settings: Settings;
  systemDefaultModel: string;
}) {
  const t = useTranslations("ai.settings");
  const [editing, setEditing] = useState<Partial<ProviderRow> | null>(null);
  const [editingTts, setEditingTts] = useState<Partial<TtsProviderRow> | null>(null);
  const [prefs, setPrefs] = useState(settings);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const currentDefault = providers.find((p) => p.isSystemDefault);
  const [defaultProviderId, setDefaultProviderId] = useState(currentDefault?.id ?? "");
  const [defaultModelDraft, setDefaultModelDraft] = useState(systemDefaultModel);

  const selectedProvider = providers.find((p) => p.id === prefs.aiProviderId) ?? providers.find((p) => p.enabled);
  const selectedDefaultProvider = providers.find((p) => p.id === defaultProviderId);

  function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await updateSettingsAction({
        aiProviderId: prefs.aiProviderId || null,
        aiModel: prefs.aiModel || null,
        ttsProviderId: prefs.ttsProviderId || null,
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
                  {p.isSystemDefault && (
                    <span className="whitespace-nowrap rounded-full border border-primary px-1.5 text-[0.625rem] font-normal text-primary">
                      {t("systemDefaultTag")}
                    </span>
                  )}
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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">{t("ttsProviders")}</h2>
          <Button size="sm" onClick={() => setEditingTts({ scope: "user", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini-tts", voice: "coral", responseFormat: "mp3", enabled: true })}>
            <Plus /> {t("addTts")}
          </Button>
        </div>
        {editingTts && <TtsProviderForm key={editingTts.id ?? "new-tts"} initial={editingTts} aiProviders={providers} isAdmin={isAdmin} onDone={() => setEditingTts(null)} />}
        <Card className="divide-y divide-border p-0">
          {ttsProviders.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{t("noTtsProviders")}</p>}
          {ttsProviders.map((provider) => (
            <div key={provider.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <Headphones className="size-4 text-ai" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {provider.name}
                  <span className="rounded-full border border-border px-1.5 text-[0.625rem] font-normal text-muted-foreground">
                    {provider.scope === "global" ? t("scopeGlobalTag") : t("scopeUserTag")}
                  </span>
                  {!provider.enabled && <span className="text-[0.625rem] text-warning">{t("disabled")}</span>}
                </p>
                <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">{provider.model} · {provider.voice} · {provider.responseFormat} · {provider.baseUrl}</p>
              </div>
              <Button variant="ghost" size="sm" disabled={busyId === `tts:${provider.id}`} onClick={async () => {
                setBusyId(`tts:${provider.id}`);
                const res = await testTtsProviderAction(provider.id);
                setBusyId(null);
                if (res.ok) toast.success(t("ttsConnected", { ms: res.ms })); else toast.error(res.error);
              }}>
                {busyId === `tts:${provider.id}` ? <Loader2 className="animate-spin" /> : <Zap />} {t("test")}
              </Button>
              {provider.editable && <>
                <Button variant="ghost" size="icon-sm" aria-label={t("edit")} onClick={() => setEditingTts(provider)}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("delete")} onClick={() => {
                  if (!window.confirm(t("deleteTtsConfirm", { name: provider.name }))) return;
                  start(async () => { const res = await deleteTtsProviderAction(provider.id); if (!res.ok) toast.error(res.error); });
                }}><Trash2 /></Button>
              </>}
            </div>
          ))}
        </Card>
        {ttsProviders.length > 0 && (
          <Card>
            <Field label={t("defaultTtsProvider")} hint={t("defaultTtsProviderHint")}>
              <Combobox
                aria-label={t("defaultTtsProvider")}
                value={prefs.ttsProviderId ?? ""}
                onValueChange={(value) => setPrefs({ ...prefs, ttsProviderId: value || null })}
                options={[{ value: "", label: t("automatic"), description: t("automaticHint") }, ...ttsProviders.filter((p) => p.enabled).map((p) => ({ value: p.id, label: p.name, description: `${p.model} · ${p.voice}` }))]}
              />
            </Field>
          </Card>
        )}
      </section>

      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">{t("systemDefaultSection")}</h2>
          <Card className="grid gap-4 sm:grid-cols-2">
            <Field label={t("systemDefaultProvider")}>
              <Combobox
                aria-label={t("systemDefaultProvider")}
                value={defaultProviderId}
                onValueChange={(v) => {
                  setDefaultProviderId(v);
                  setDefaultModelDraft(providers.find((p) => p.id === v)?.defaultModel ?? "");
                }}
                options={providers.map((p) => ({
                  value: p.id,
                  label: p.name,
                  description: `${meta[p.type].label}${p.defaultModel ? ` · ${p.defaultModel}` : ""}`,
                }))}
              />
            </Field>
            <Field label={t("systemDefaultModelLabel")}>
              <ModelCombobox
                value={defaultModelDraft}
                onValueChange={setDefaultModelDraft}
                placeholder={selectedDefaultProvider?.defaultModel ? t("providerDefault", { model: selectedDefaultProvider.defaultModel }) : undefined}
                cacheKey={defaultProviderId || null}
                unavailableReason={t("addProviderFirst")}
                load={() => listModelsAction(defaultProviderId)}
              />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("setSystemDefaultHint")}</p>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              <Button
                variant="primary"
                disabled={pending || !defaultProviderId || !defaultModelDraft}
                onClick={() =>
                  start(async () => {
                    const res = await setSystemDefaultAction(defaultProviderId, defaultModelDraft);
                    if (res.ok) toast.success(t("systemDefaultSet"));
                    else toast.error(res.error);
                  })
                }
              >
                <ShieldCheck /> {t("setSystemDefault")}
              </Button>
              {currentDefault && (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await clearSystemDefaultAction();
                      setDefaultProviderId("");
                      setDefaultModelDraft("");
                      toast.success(t("systemDefaultRemoved"));
                    })
                  }
                >
                  {t("removeSystemDefault")}
                </Button>
              )}
            </div>
          </Card>
        </section>
      )}

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

function TtsProviderForm({ initial, aiProviders, isAdmin, onDone }: { initial: Partial<TtsProviderRow>; aiProviders: ProviderRow[]; isAdmin: boolean; onDone: () => void }) {
  const t = useTranslations("ai.ttsForm");
  const reusableProviders = aiProviders.filter((provider) => provider.type === "openai" || provider.type === "openai_compatible");
  const [sourceAiProviderId, setSourceAiProviderId] = useState("");
  const [form, setForm] = useState({
    scope: initial.scope ?? "user",
    name: initial.name ?? "OpenAI TTS",
    baseUrl: initial.baseUrl ?? "https://api.openai.com/v1",
    apiKey: "",
    model: initial.model ?? "gpt-4o-mini-tts",
    voice: initial.voice ?? "coral",
    responseFormat: initial.responseFormat ?? "mp3",
    enabled: initial.enabled ?? true,
  });
  const [pending, start] = useTransition();
  return (
    <Card>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const res = await saveTtsProviderAction({ ...form, sourceAiProviderId: sourceAiProviderId || undefined, id: initial.id, scope: form.scope as "user" | "global", responseFormat: form.responseFormat as "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm" });
          if (res.ok) { toast.success(t("saved")); onDone(); } else toast.error(res.error);
        });
      }}>
        {!initial.id && reusableProviders.length > 0 && (
          <Field className="sm:col-span-2" label={t("configurationSource")} hint={t("configurationSourceHint")}>
            <Combobox
              aria-label={t("configurationSource")}
              value={sourceAiProviderId}
              onValueChange={(value) => {
                setSourceAiProviderId(value);
                const provider = reusableProviders.find((candidate) => candidate.id === value);
                if (!provider) return;
                setForm((current) => ({
                  ...current,
                  name: `${provider.name} TTS`,
                  baseUrl: provider.baseUrl || "https://api.openai.com/v1",
                  model: provider.defaultModel || current.model,
                }));
              }}
              options={[
                { value: "", label: t("newProvider"), description: t("newProviderHint") },
                ...reusableProviders.map((provider) => ({
                  value: provider.id,
                  label: provider.name,
                  description: `${provider.defaultModel || t("noDefaultModel")} · ${provider.scope === "global" ? t("scopeGlobal") : t("scopeUser")}`,
                })),
              ]}
            />
          </Field>
        )}
        <Field label={t("name")}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={t("baseUrl")} hint={sourceAiProviderId ? t("importedFromProvider") : undefined}><Input type="url" required disabled={Boolean(sourceAiProviderId)} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} /></Field>
        {!sourceAiProviderId && <Field label="API key" hint={initial.hasKey ? t("keepKey") : t("keyOptional")}><Input type="password" autoComplete="off" value={form.apiKey} placeholder={initial.hasKey ? "••••••••" : ""} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} /></Field>}
        <Field label={t("model")}>
          {sourceAiProviderId ? (
            <ModelCombobox
              value={form.model}
              onValueChange={(model) => setForm({ ...form, model })}
              cacheKey={sourceAiProviderId}
              load={() => listModelsAction(sourceAiProviderId)}
              placeholder={t("modelPlaceholder")}
            />
          ) : <Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />}
        </Field>
        <Field label={t("voice")}><Input required value={form.voice} placeholder="coral" onChange={(e) => setForm({ ...form, voice: e.target.value })} /></Field>
        <Field label={t("format")}><Combobox searchable={false} value={form.responseFormat} onValueChange={(value) => setForm({ ...form, responseFormat: value })} options={["mp3", "opus", "aac", "flac", "wav", "pcm"].map((value) => ({ value, label: value.toUpperCase() }))} /></Field>
        {isAdmin && !initial.id && <Field label={t("scope")}><Combobox searchable={false} value={form.scope} onValueChange={(value) => setForm({ ...form, scope: value as "user" | "global" })} options={[{ value: "user", label: t("scopeUser") }, { value: "global", label: t("scopeGlobal") }]} /></Field>}
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} /> {t("enabled")}</label>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="primary" disabled={pending}>{pending && <Loader2 className="animate-spin" />} {t("save")}</Button><Button type="button" variant="ghost" onClick={onDone}>{t("cancel")}</Button></div>
      </form>
    </Card>
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
