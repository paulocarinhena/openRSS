"use client";

import { Download, Folder as FolderIcon, FolderPlus, Inbox, Loader2, Pencil, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
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
  const [pending, start] = useTransition();
  const [newFolder, setNewFolder] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Erro");
      else if (success) toast.success(success);
    });

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">OPML</p>
          <p className="text-xs text-muted-foreground">Importe assinaturas de outro leitor ou exporte as suas.</p>
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
              if (res.ok) toast.success(`${res.imported} feeds importados${res.failed ? `, ${res.failed} falharam` : ""}`);
              else toast.error(res.error);
              if (fileRef.current) fileRef.current.value = "";
            });
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Upload />} Importar
        </Button>
        <Button asChild>
          <a href="/api/opml/export">
            <Download /> Exportar
          </a>
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Pastas</h2>
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
          <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Nova pasta" />
          <Button type="submit" disabled={pending || !newFolder.trim()}>
            <FolderPlus /> Criar
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
                  aria-label="Renomear pasta"
                  onClick={() => {
                    const name = window.prompt("Novo nome da pasta", f.name);
                    if (name && name !== f.name) run(() => renameFolderAction(f.id, name));
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Excluir pasta"
                  onClick={() => {
                    if (window.confirm(`Excluir a pasta "${f.name}"? Os feeds ficam sem pasta.`)) run(() => deleteFolderAction(f.id), "Pasta excluída");
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
        <h2 className="eyebrow">Assinaturas ({subscriptions.length})</h2>
        <Card className="divide-y divide-border p-0">
          {subscriptions.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma assinatura.</p>}
          {subscriptions.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  {s.lastError && <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-label={s.lastError} />}
                  {s.customTitle ?? s.title}
                </p>
                <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">{s.url}</p>
                <p className="text-[0.6875rem] text-muted-foreground" suppressHydrationWarning>
                  {s.lastError ? `Erro: ${s.lastError}` : s.lastFetchedAt ? `Atualizado ${relativeTime(s.lastFetchedAt)}` : "Nunca atualizado"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Combobox
                  size="sm"
                  className="w-44"
                  aria-label="Pasta"
                  value={s.folderId ?? ""}
                  searchPlaceholder="Buscar pasta…"
                  onValueChange={(v) => run(() => updateSubscriptionAction(s.id, { folderId: v || null }))}
                  options={[
                    { value: "", label: "Sem pasta", icon: <Inbox /> },
                    ...folders.map((f) => ({ value: f.id, label: f.name, icon: <FolderIcon /> })),
                  ]}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Renomear"
                  onClick={() => {
                    const title = window.prompt("Nome do feed (vazio = original)", s.customTitle ?? s.title);
                    if (title !== null) run(() => updateSubscriptionAction(s.id, { customTitle: title }));
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cancelar assinatura"
                  onClick={() => {
                    if (window.confirm(`Cancelar assinatura de "${s.customTitle ?? s.title}"?`)) run(() => unsubscribeAction(s.id), "Assinatura removida");
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
