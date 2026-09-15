"use client";

import { Dialog } from "radix-ui";
import { Check, Folder as FolderIcon, Inbox, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { discoverAction, subscribeAction } from "@/app/actions/feeds";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

type Found = { url: string; title: string; siteUrl: string | null; itemCount: number; subscribed: boolean };

export function AddFeedDialog({
  folders,
  trigger,
}: {
  folders: { id: string; name: string }[];
  trigger: React.ReactNode;
}) {
  const t = useTranslations("feeds.add");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [subscribing, setSubscribing] = useState<string | null>(null);

  function reset() {
    setQuery("");
    setFound(null);
    setError(null);
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSearch(async () => {
      const res = await discoverAction(query);
      if (res.ok) setFound(res.feeds);
      else {
        setFound(null);
        setError(res.error);
      }
    });
  }

  async function add(feed: Found) {
    setSubscribing(feed.url);
    const res = await subscribeAction(feed.url, folderId || null);
    setSubscribing(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("subscribedToast", { title: feed.title }));
    setOpen(false);
    reset();
    router.push(`/feed/${res.feedId}`);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col gap-4 overflow-hidden rounded-card border border-border bg-surface p-5 shadow-card">
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

          <form onSubmit={search} className="flex gap-2">
            <Input autoFocus placeholder={t("urlPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button type="submit" variant="primary" disabled={searching || query.trim().length < 3}>
              {searching ? <Loader2 className="animate-spin" /> : t("search")}
            </Button>
          </form>

          {folders.length > 0 && (
            <Combobox
              aria-label={t("folder")}
              value={folderId}
              onValueChange={setFolderId}
              searchPlaceholder={t("searchFolder")}
              options={[
                { value: "", label: t("noFolder"), icon: <Inbox /> },
                ...folders.map((f) => ({ value: f.id, label: f.name, icon: <FolderIcon /> })),
              ]}
            />
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {found && (
            <ul className="-mx-1 flex flex-col gap-1 overflow-y-auto">
              {found.map((f) => (
                <li key={f.url} className="flex items-center gap-3 rounded-input px-2 py-2 hover:bg-accent">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.title}</p>
                    <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">
                      {f.url} · {t("items", { count: f.itemCount })}
                    </p>
                  </div>
                  {f.subscribed ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Check className="size-3.5" /> {t("subscribed")}
                    </span>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => add(f)} disabled={subscribing !== null}>
                      {subscribing === f.url ? <Loader2 className="animate-spin" /> : <Plus />}
                      {t("subscribe")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
