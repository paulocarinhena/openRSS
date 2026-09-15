"use client";

import { Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
      if (res.ok) toast.success("Preferências salvas");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Provedores</h2>
          <Button size="sm" onClick={() => setEditing({ scope: "user", type: "openai", enabled: true })}>
            <Plus /> Adicionar
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
          {providers.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nenhum provedor. Adicione OpenAI, Anthropic, OpenRouter ou qualquer API OpenAI-compatible (Ollama, LM Studio, vLLM…).
            </p>
          )}
          {providers.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {p.name}
                  <span className="rounded-full border border-border px-1.5 text-[0.625rem] font-normal text-muted-foreground">
                    {p.scope === "global" ? "global" : "pessoal"}
                  </span>
                  {!p.enabled && <span className="text-[0.625rem] text-warning">desativado</span>}
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
                  if (res.ok) toast.success(`Conectado em ${res.ms} ms — “${res.reply}”`);
                  else toast.error(res.error);
                }}
              >
                {busyId === p.id ? <Loader2 className="animate-spin" /> : <Zap />} Testar
              </Button>
              {p.editable && (
                <>
                  <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditing(p)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Excluir"
                    onClick={() => {
                      if (!window.confirm(`Excluir o provedor "${p.name}"?`)) return;
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
        <h2 className="eyebrow">Preferências</h2>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Provedor padrão">
            <Combobox
              aria-label="Provedor padrão"
              value={prefs.aiProviderId ?? ""}
              onValueChange={(v) => setPrefs({ ...prefs, aiProviderId: v || null, aiModel: "" })}
              options={[
                { value: "", label: "Automático", description: "Primeiro provedor disponível" },
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
          <Field label="Modelo">
            <ModelCombobox
              value={prefs.aiModel}
              onValueChange={(v) => setPrefs({ ...prefs, aiModel: v })}
              placeholder={selectedProvider?.defaultModel ? `Padrão do provedor: ${selectedProvider.defaultModel}` : "Selecione ou digite um modelo"}
              cacheKey={selectedProvider?.id ?? null}
              unavailableReason="Adicione um provedor para escolher o modelo."
              load={() => listModelsAction(selectedProvider!.id)}
            />
          </Field>

          <Field
            className="sm:col-span-2"
            label="Interesses (para priorização)"
            hint="Descreva em texto livre o que é importante para você. A IA usa isso para dar nota aos artigos novos."
          >
            <Textarea
              value={prefs.interests}
              onChange={(e) => setPrefs({ ...prefs, interests: e.target.value })}
              placeholder="Ex.: lançamentos de modelos de IA, segurança em Kubernetes, economia brasileira. Pouco interesse em fofoca de celebridades."
            />
          </Field>

          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span>
              <span className="block font-medium">Priorizar artigos com IA</span>
              <span className="text-xs text-muted-foreground">Classifica artigos novos após cada atualização (consome tokens).</span>
            </span>
            <Switch checked={prefs.classifyEnabled} onCheckedChange={(v) => setPrefs({ ...prefs, classifyEnabled: v })} />
          </label>

          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span>
              <span className="block font-medium">Digest diário automático</span>
              <span className="text-xs text-muted-foreground">Gera um resumo dos não lidos das últimas 24h.</span>
            </span>
            <Switch checked={prefs.digestEnabled} onCheckedChange={(v) => setPrefs({ ...prefs, digestEnabled: v })} />
          </label>

          {prefs.digestEnabled && (
            <Field label="Horário do digest">
              <Combobox
                aria-label="Horário do digest"
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
            Salvar preferências
          </Button>
          {prefs.classifyEnabled && (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await classifyRecentAction();
                  if (res.ok) toast.success(`${res.count} artigos classificados`);
                  else toast.error(res.error);
                })
              }
            >
              Classificar não lidos recentes
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function ProviderForm({ initial, meta, isAdmin, onDone }: { initial: Partial<ProviderRow>; meta: Meta; isAdmin: boolean; onDone: () => void }) {
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
              toast.success("Provedor salvo");
              onDone();
            } else toast.error(res.error);
          });
        }}
      >
        <Field label="Tipo">
          <Combobox
            aria-label="Tipo de provedor"
            value={form.type}
            disabled={Boolean(initial.id)}
            onValueChange={(v) => setForm({ ...form, type: v as ProviderType })}
            options={(Object.keys(meta) as ProviderType[]).map((t) => ({
              value: t,
              label: meta[t].label,
              description: t === "openai_compatible" ? "Ollama, LM Studio, vLLM…" : meta[t].modelHint,
            }))}
          />
        </Field>
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={m.label} />
        </Field>
        <Field label="API key" hint={initial.hasKey ? "Deixe em branco para manter a chave atual." : form.type === "openai_compatible" ? "Opcional para servidores locais." : undefined}>
          <Input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={initial.hasKey ? "••••••••" : ""} />
        </Field>
        <Field label={m.needsBaseUrl ? "Base URL" : "Base URL (opcional)"}>
          <Input value={form.baseUrl} required={m.needsBaseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={m.defaultBaseUrl} />
        </Field>
        <Field label="Modelo padrão">
          <ModelCombobox
            aria-label="Modelo padrão"
            value={form.defaultModel}
            onValueChange={(v) => setForm({ ...form, defaultModel: v })}
            placeholder={`Ex.: ${m.modelHint}`}
            cacheKey={
              form.type === "openai_compatible"
                ? form.baseUrl
                  ? `${form.type}|${form.baseUrl}|${form.apiKey}`
                  : null
                : form.type === "openrouter" || form.apiKey || initial.hasKey
                  ? `${form.type}|${form.baseUrl}|${form.apiKey}`
                  : null
            }
            unavailableReason={form.type === "openai_compatible" ? "Informe a Base URL para carregar os modelos." : "Informe a API key para carregar os modelos."}
            load={() => fetchModelsAction({ providerId: initial.id, type: form.type, baseUrl: form.baseUrl, apiKey: form.apiKey })}
          />
        </Field>
        {isAdmin && !initial.id && (
          <Field label="Escopo" hint="Globais ficam disponíveis para todos os usuários.">
            <Combobox
              aria-label="Escopo"
              value={form.scope}
              onValueChange={(v) => setForm({ ...form, scope: v as "user" | "global" })}
              options={[
                { value: "user", label: "Pessoal", description: "Só você usa" },
                { value: "global", label: "Global", description: "Todos os usuários" },
              ]}
            />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /> Ativo
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Salvar
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
