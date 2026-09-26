"use client";

import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { createApiTokenAction, revokeApiTokenAction } from "@/app/actions/api-tokens";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/utils";

type Token = { id: string; name: string; createdAt: Date; lastUsedAt: Date | null };

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const t = useTranslations("apps");
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input readOnly value={value} className={mono ? "font-mono text-xs" : undefined} onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("copy")}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </Field>
  );
}

export function AppsSettings({ tokens, email, greaderUrl, feverUrl }: { tokens: Token[]; email: string; greaderUrl: string; feverUrl: string }) {
  const t = useTranslations("apps");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [pending, start] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createApiTokenAction(name);
      if (!res.ok) return void toast.error(res.error);
      setCreated({ name, password: res.password });
      setName("");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="eyebrow">{t("title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
        </div>
        <Card className="grid gap-4 sm:grid-cols-2">
          <CopyField label={t("greaderUrl")} value={greaderUrl} />
          <CopyField label={t("feverUrl")} value={feverUrl} />
          <CopyField label={t("username")} value={email} />
          <p className="self-end text-[0.6875rem] text-muted-foreground">{t("clientsHint")}</p>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">{t("passwords")}</h2>
        <Card className="flex flex-col gap-4">
          <form onSubmit={create} className="flex flex-wrap items-end gap-2">
            <Field label={t("newPasswordName")} className="min-w-48 flex-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} maxLength={60} required />
            </Field>
            <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} {t("create")}
            </Button>
          </form>

          {created && (
            <div role="status" className="flex flex-col gap-2 rounded-input border border-primary/40 bg-accent p-3">
              <p className="text-xs font-medium">{t("createdOnce", { name: created.name })}</p>
              <CopyField label={t("password")} value={created.password} />
            </div>
          )}

          <div className="divide-y divide-border">
            {tokens.length === 0 && <p className="py-2 text-sm text-muted-foreground">{t("empty")}</p>}
            {tokens.map((token) => (
              <div key={token.id} className="flex items-center gap-3 py-2.5">
                <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{token.name}</p>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {t("createdAt", { when: relativeTime(new Date(token.createdAt), locale) })} ·{" "}
                    {token.lastUsedAt ? t("lastUsed", { when: relativeTime(new Date(token.lastUsedAt), locale) }) : t("neverUsed")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(t("revokeConfirm", { name: token.name }))) return;
                    start(async () => {
                      await revokeApiTokenAction(token.id);
                      toast.success(t("revoked"));
                    });
                  }}
                >
                  <Trash2 /> {t("revoke")}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
