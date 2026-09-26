"use client";

import { Flag, FlaskConical, History, Loader2, Pencil, Plus, Send, Trash2, TriangleAlert, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  applyRuleToExistingAction,
  deleteRuleAction,
  previewRuleAction,
  saveRuleAction,
  setRuleEnabledAction,
  testWebhookAction,
} from "@/app/actions/rules";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Label, Switch } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
  RULE_ACTIONS,
  RULE_FIELDS,
  SCORE_OPS,
  TEXT_OPS,
  WEBHOOK_FORMATS,
  type RuleAction,
  type RuleCondition,
  type WebhookFormat,
} from "@/lib/rules/engine";
import { cn, relativeTime } from "@/lib/utils";

export type RuleView = {
  id: string;
  name: string;
  enabled: boolean;
  scope: "all" | "feed" | "folder";
  scopeId: string | null;
  matchAll: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
  webhookFormat: WebhookFormat;
  webhookMasked: string | null;
  hitCount: number;
  lastHitAt: Date | null;
};

type Draft = Omit<RuleView, "id" | "hitCount" | "lastHitAt" | "webhookMasked"> & {
  id?: string;
  webhookUrl: string;
  webhookMasked: string | null;
};

type Prefill = Pick<RuleView, "scope" | "scopeId" | "conditions">;

type Preview = Extract<Awaited<ReturnType<typeof previewRuleAction>>, { ok: true }>;

const EMPTY_CONDITION: RuleCondition = { field: "title", op: "contains", value: "" };

const newDraft = (prefill?: Prefill | null): Draft => ({
  name: "",
  enabled: true,
  scope: prefill?.scope ?? "all",
  scopeId: prefill?.scopeId ?? null,
  matchAll: true,
  conditions: prefill?.conditions.length ? prefill.conditions : [EMPTY_CONDITION],
  actions: ["markRead"],
  webhookFormat: "ntfy",
  webhookUrl: "",
  webhookMasked: null,
});

export function RulesManager({
  rules,
  feeds,
  folders,
  aiReady,
  prefill,
}: {
  rules: RuleView[];
  feeds: { id: string; title: string }[];
  folders: { id: string; name: string }[];
  aiReady: boolean;
  prefill: Prefill | null;
}) {
  const t = useTranslations("rules");
  const locale = useLocale();
  const [editing, setEditing] = useState<Draft | null>(prefill ? newDraft(prefill) : null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  const scopeLabel = (r: Pick<RuleView, "scope" | "scopeId">) =>
    r.scope === "feed"
      ? (feeds.find((f) => f.id === r.scopeId)?.title ?? t("missingTarget"))
      : r.scope === "folder"
        ? (folders.find((f) => f.id === r.scopeId)?.name ?? t("missingTarget"))
        : t("scopes.all");

  const usesScore = rules.some((r) => r.enabled && r.conditions.some((c) => c.field === "score"));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="eyebrow">{t("title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setEditing(newDraft())}>
            <Plus /> {t("add")}
          </Button>
        </div>

        {usesScore && !aiReady && (
          <p role="status" className="flex items-start gap-2 rounded-input border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
            {t("aiNotReady")}
          </p>
        )}

        {editing && (
          <RuleEditor
            key={editing.id ?? "new"}
            initial={editing}
            feeds={feeds}
            folders={folders}
            aiReady={aiReady}
            onDone={() => setEditing(null)}
          />
        )}

        <Card className="divide-y divide-border p-0">
          {rules.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{t("empty")}</p>}
          {rules.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-4 py-3">
              <Switch
                className="mt-0.5"
                checked={r.enabled}
                aria-label={t("enabled")}
                onCheckedChange={(enabled) => start(async () => void (await setRuleEnabledAction(r.id, enabled)))}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", !r.enabled && "text-muted-foreground")}>{r.name}</p>
                <p className="truncate text-[0.6875rem] text-muted-foreground">
                  {scopeLabel(r)} · {t("conditionCount", { count: r.conditions.length })}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={t("actionsLabel")}>
                  {r.actions.map((a) => (
                    <li key={a} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-px text-[0.6875rem] text-muted-foreground">
                      {a === "highlight" && <Flag className="size-2.5 fill-current text-warning" aria-hidden />}
                      {t(`actions.${a}`)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
                  {t("hits", { count: r.hitCount })}
                  {r.lastHitAt && ` · ${t("lastHit", { when: relativeTime(new Date(r.lastHitAt), locale) })}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={busyId === r.id}
                title={`${t("applyExisting")} — ${t("applyExistingHint")}`}
                aria-label={t("applyExisting")}
                onClick={() => {
                  if (!window.confirm(t("applyExistingConfirm", { name: r.name }))) return;
                  setBusyId(r.id);
                  start(async () => {
                    const res = await applyRuleToExistingAction(r.id);
                    setBusyId(null);
                    if (res.ok) toast.success(t("appliedExisting", { count: res.count }));
                    else toast.error(res.error);
                  });
                }}
              >
                {busyId === r.id ? <Loader2 className="animate-spin" /> : <History />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("edit")}
                title={t("edit")}
                onClick={() => setEditing({ ...r, webhookUrl: "" })}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("delete")}
                title={t("delete")}
                onClick={() => {
                  if (!window.confirm(t("deleteConfirm", { name: r.name }))) return;
                  start(async () => {
                    await deleteRuleAction(r.id);
                    toast.success(t("deleted"));
                  });
                }}
              >
                <Trash2 />
              </Button>
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function RuleEditor({
  initial,
  feeds,
  folders,
  aiReady,
  onDone,
}: {
  initial: Draft;
  feeds: { id: string; title: string }[];
  folders: { id: string; name: string }[];
  aiReady: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("rules");
  const [draft, setDraft] = useState<Draft>(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const [testing, setTesting] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setPreview(null);
  };
  const setCondition = (index: number, patch: Partial<RuleCondition>) =>
    set(
      "conditions",
      draft.conditions.map((c, i) => {
        if (i !== index) return c;
        const next = { ...c, ...patch } as RuleCondition;
        // Nota da IA usa operadores numéricos; texto usa os de texto.
        if (patch.field && (patch.field === "score") !== (c.field === "score")) {
          next.op = patch.field === "score" ? "gte" : "contains";
          next.value = patch.field === "score" ? "80" : "";
        }
        return next;
      }),
    );
  const toggleAction = (action: RuleAction, on: boolean) =>
    set("actions", on ? [...draft.actions, action] : draft.actions.filter((a) => a !== action));

  const notify = draft.actions.includes("notify");
  const scoreUsed = draft.conditions.some((c) => c.field === "score");
  const draftPayload = { scope: draft.scope, scopeId: draft.scopeId, matchAll: draft.matchAll, conditions: draft.conditions };

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await saveRuleAction({
        id: draft.id,
        name: draft.name,
        enabled: draft.enabled,
        ...draftPayload,
        actions: draft.actions,
        webhookUrl: draft.webhookUrl,
        webhookFormat: draft.webhookFormat,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("saved"));
      onDone();
    });
  }

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("name")} className="sm:col-span-2">
            <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder={t("namePlaceholder")} maxLength={80} required autoFocus />
          </Field>
          <Field label={t("scope")}>
            <Combobox
              searchable={false}
              value={draft.scope}
              onValueChange={(v) => {
                set("scope", v as Draft["scope"]);
                set("scopeId", null);
              }}
              options={(["all", "feed", "folder"] as const).map((s) => ({ value: s, label: t(`scopes.${s}`) }))}
            />
          </Field>
          {draft.scope !== "all" && (
            <Field label={draft.scope === "feed" ? t("feed") : t("folder")}>
              <Combobox
                value={draft.scopeId ?? ""}
                onValueChange={(v) => set("scopeId", v || null)}
                placeholder={t("choose")}
                options={
                  draft.scope === "feed"
                    ? feeds.map((f) => ({ value: f.id, label: f.title }))
                    : folders.map((f) => ({ value: f.id, label: f.name }))
                }
              />
            </Field>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-xs font-medium">{t("conditions")}</legend>
            <Combobox
              size="sm"
              searchable={false}
              className="w-auto"
              aria-label={t("match")}
              value={draft.matchAll ? "all" : "any"}
              onValueChange={(v) => set("matchAll", v === "all")}
              options={[
                { value: "all", label: t("matchAll") },
                { value: "any", label: t("matchAny") },
              ]}
            />
          </div>
          {draft.conditions.map((c, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,9rem)_minmax(0,1fr)_auto] max-sm:rounded-input max-sm:border max-sm:border-border max-sm:p-2"
            >
              <Combobox
                size="sm"
                searchable={false}
                aria-label={t("field")}
                value={c.field}
                onValueChange={(v) => setCondition(i, { field: v as RuleCondition["field"] })}
                options={RULE_FIELDS.map((f) => ({ value: f, label: t(`fields.${f}`) }))}
              />
              <Combobox
                size="sm"
                searchable={false}
                aria-label={t("operator")}
                value={c.op}
                onValueChange={(v) => setCondition(i, { op: v as RuleCondition["op"] })}
                options={(c.field === "score" ? SCORE_OPS : TEXT_OPS).map((o) => ({ value: o, label: t(`ops.${o}`) }))}
              />
              <Input
                aria-label={t("value")}
                className="h-7 text-xs max-sm:order-last max-sm:col-span-3"
                value={c.value}
                type={c.field === "score" ? "number" : "text"}
                min={c.field === "score" ? 0 : undefined}
                max={c.field === "score" ? 100 : undefined}
                maxLength={200}
                onChange={(e) => setCondition(i, { value: e.target.value })}
                placeholder={c.op === "regex" ? "^(oferta|cupom)" : undefined}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("removeCondition")}
                disabled={draft.conditions.length === 1}
                onClick={() => set("conditions", draft.conditions.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="ghost" size="sm" disabled={draft.conditions.length >= 10} onClick={() => set("conditions", [...draft.conditions, EMPTY_CONDITION])}>
              <Plus /> {t("addCondition")}
            </Button>
          </div>
          {scoreUsed && <p className="text-[0.6875rem] text-muted-foreground">{aiReady ? t("scoreHint") : t("aiNotReady")}</p>}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium">{t("actionsLabel")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {RULE_ACTIONS.map((a) => (
              <div key={a} className="flex items-center justify-between gap-3 rounded-input border border-border px-3 py-2">
                <Label htmlFor={`rule-action-${a}`} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    {a === "highlight" && <Flag className="size-3 fill-current text-warning" />}
                    {t(`actions.${a}`)}
                  </span>
                  <span className="font-normal text-muted-foreground">{t(`actionHints.${a}`)}</span>
                </Label>
                <Switch id={`rule-action-${a}`} checked={draft.actions.includes(a)} onCheckedChange={(on) => toggleAction(a, on)} />
              </div>
            ))}
          </div>
        </fieldset>

        {notify && (
          <div className="grid gap-3 rounded-input border border-border p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Field label={t("webhookFormat")}>
              <Combobox
                searchable={false}
                value={draft.webhookFormat}
                onValueChange={(v) => set("webhookFormat", v as WebhookFormat)}
                options={WEBHOOK_FORMATS.map((f) => ({ value: f, label: t(`formats.${f}`) }))}
              />
            </Field>
            <Field
              label={t("webhookUrl")}
              hint={draft.webhookMasked ? t("webhookKeep", { current: draft.webhookMasked }) : t(`formatHints.${draft.webhookFormat}`)}
            >
              <Input
                type="url"
                value={draft.webhookUrl}
                onChange={(e) => set("webhookUrl", e.target.value)}
                placeholder={t(`formatPlaceholders.${draft.webhookFormat}`)}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={testing || (!draft.webhookUrl && !draft.webhookMasked)}
                onClick={async () => {
                  setTesting(true);
                  const res = await testWebhookAction({ ruleId: draft.id, webhookUrl: draft.webhookUrl, webhookFormat: draft.webhookFormat });
                  setTesting(false);
                  if (res.ok) toast.success(t("webhookSent"));
                  else toast.error(res.error);
                }}
              >
                {testing ? <Loader2 className="animate-spin" /> : <Send />} {t("sendTest")}
              </Button>
            </div>
          </div>
        )}

        {preview && (
          <div className="flex flex-col gap-2 rounded-input border border-border p-3" aria-live="polite">
            <p className="text-xs font-medium">{t("previewResult", { count: preview.count, total: preview.total })}</p>
            {preview.sample.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs">
                {preview.sample.map((a) => (
                  <li key={a.id} className="truncate text-muted-foreground">
                    <span className="text-foreground">{a.title}</span> · {a.feed}
                    {a.score !== null && ` · ${a.score}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await previewRuleAction(draftPayload);
                if (res.ok) setPreview(res);
                else toast.error(res.error);
              })
            }
          >
            <FlaskConical /> {t("preview")}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {t("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
