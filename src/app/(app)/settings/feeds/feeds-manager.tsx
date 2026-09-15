"use client";

import { Download, Folder as FolderIcon, FolderPlus, Inbox, Loader2, Pencil, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import {
  createFolderAction,
  deleteFolderAction,
  importOpmlAction,
  renameFolderAction,
  unsubscribeAction,
  updateSubscriptionAction,
} from "@/app/actions/feeds";
import { relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Card, Input } from "@/components/ui/input";

type Sub = {
  id: string;
  feedId: string;
  folderId: string | null;
  customTitle: string | null;
  title: string;
  url: string;
  lastFetchedAt: Date | null;
  lastError: string | null;
};

export function FeedsManager({ folders, subscriptions }: { folders: { id: string; name: string }[]; subscriptions: Sub[] }) {
  const t = useTranslations("feeds.manager");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [newFolder, setNewFolder] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? t("genericError"));
      else if (success) toast.success(success);
    });

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">OPML</p>
          <p className="text-xs text-muted-foreground">{t("opmlDescription")}</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".opml,.xml,text/xml,application/xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const data = new FormData();
            data.set("file", file);
            start(async () => {
              const res = await importOpmlAction(data);
              if (res.ok) toast.success(t("imported", { count: res.imported }) + (res.failed ? t("importFailed", { count: res.failed }) : ""));
              else toast.error(res.error);
              if (fileRef.current) fileRef.current.value = "";
            });
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Upload />} {t("import")}
        </Button>
        <Button asChild>
          <a href="/api/opml/export">
            <Download /> {t("export")}
          </a>
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">{t("folders")}</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await createFolderAction(newFolder);
              if (res.ok) setNewFolder("");
              return res;
            });
          }}
        >
          <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder={t("newFolder")} />
          <Button type="submit" disabled={pending || !newFolder.trim()}>
            <FolderPlus /> {t("create")}
          </Button>
        </form>
        {folders.length > 0 && (
          <Card className="divide-y divide-border p-0">
            {folders.map((f) => (
              <div key={f.id} className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1 truncate">{f.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("renameFolder")}
                  onClick={() => {
                    const name = window.prompt(t("renameFolderPrompt"), f.name);
                    if (name && name !== f.name) run(() => renameFolderAction(f.id, name));
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("deleteFolder")}
                  onClick={() => {
                    if (window.confirm(t("deleteFolderConfirm", { name: f.name }))) run(() => deleteFolderAction(f.id), t("folderDeleted"));
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">{t("subscriptions", { count: subscriptions.length })}</h2>
        <Card className="divide-y divide-border p-0">
          {subscriptions.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{t("noSubscriptions")}</p>}
          {subscriptions.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  {s.lastError && <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-label={s.lastError} />}
                  {s.customTitle ?? s.title}
                </p>
                <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">{s.url}</p>
                <p className="text-[0.6875rem] text-muted-foreground" suppressHydrationWarning>
                  {s.lastError
                    ? t("error", { error: s.lastError })
                    : s.lastFetchedAt
                      ? t("updated", { when: relativeTime(s.lastFetchedAt, locale) })
                      : t("neverUpdated")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Combobox
                  size="sm"
                  className="w-44"
                  aria-label={t("folder")}
                  value={s.folderId ?? ""}
                  searchPlaceholder={t("searchFolder")}
                  onValueChange={(v) => run(() => updateSubscriptionAction(s.id, { folderId: v || null }))}
                  options={[
                    { value: "", label: t("noFolder"), icon: <Inbox /> },
                    ...folders.map((f) => ({ value: f.id, label: f.name, icon: <FolderIcon /> })),
                  ]}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("rename")}
                  onClick={() => {
                    const title = window.prompt(t("renameFeedPrompt"), s.customTitle ?? s.title);
                    if (title !== null) run(() => updateSubscriptionAction(s.id, { customTitle: title }));
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("unsubscribe")}
                  onClick={() => {
                    if (window.confirm(t("unsubscribeConfirm", { title: s.customTitle ?? s.title }))) run(() => unsubscribeAction(s.id), t("unsubscribed"));
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
