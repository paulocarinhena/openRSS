"use client";

import { Dialog } from "radix-ui";
import { Link2, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveLinkAction } from "@/app/actions/links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Campo de URL + botão; ao salvar, abre o artigo em Salvos. */
export function SaveLinkForm({ initialUrl = "", autoFocus = true, onSaved }: { initialUrl?: string; autoFocus?: boolean; onSaved?: () => void }) {
  const t = useTranslations("links");
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveLinkAction(url);
      if (!res.ok) return setError(res.error);
      toast.success(res.existed ? t("alreadyHad") : t("saved"));
      onSaved?.();
      // Navegação completa: a lista de Salvos já aberta só lê os itens ao montar.
      window.location.assign(`/saved?a=${encodeURIComponent(res.articleId)}`);
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="url"
          autoFocus={autoFocus}
          required
          aria-label={t("urlLabel")}
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={pending || !url.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : t("save")}
        </Button>
      </div>
      {pending && <p className="text-xs text-muted-foreground">{t("reading")}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function SaveLinkDialog() {
  const t = useTranslations("links");
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon-sm" title={t("title")} aria-label={t("title")}>
          <Link2 />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-[12vh] left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight">{t("title")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">{t("description")}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("close")}>
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <SaveLinkForm onSaved={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
