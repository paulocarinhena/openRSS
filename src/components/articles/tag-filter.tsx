"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteTagAction, renameTagAction } from "@/app/actions/tags";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TagCount = { id: string; name: string; count: number };

/** Filtro por tag na tela de Salvos, com renomear/apagar a tag ativa. */
export function TagFilter({ tags, active }: { tags: TagCount[]; active: string | undefined }) {
  const t = useTranslations("tags");
  const router = useRouter();
  const [pending, start] = useTransition();
  if (tags.length === 0) return null;
  const current = tags.find((tag) => tag.name === active);
  const chip = "shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors";

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label={t("filter")}>
      <Link href="/saved" className={cn(chip, !active ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
        {t("all")}
      </Link>
      {tags.map((tag) => (
        <Link
          key={tag.id}
          href={`/saved?tag=${encodeURIComponent(tag.name)}`}
          aria-current={tag.name === active ? "page" : undefined}
          className={cn(chip, tag.name === active ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
        >
          #{tag.name} · {tag.count}
        </Link>
      ))}
      {current && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("rename")}
            title={t("rename")}
            disabled={pending}
            onClick={() => {
              const name = window.prompt(t("renamePrompt"), current.name)?.trim();
              if (!name || name === current.name) return;
              start(async () => {
                const res = await renameTagAction(current.id, name);
                if (!res.ok) return void toast.error(res.error);
                router.replace(`/saved?tag=${encodeURIComponent(name)}`);
              });
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("delete")}
            title={t("delete")}
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("deleteConfirm", { name: current.name }))) return;
              start(async () => {
                await deleteTagAction(current.id);
                router.replace("/saved");
              });
            }}
          >
            <Trash2 />
          </Button>
        </>
      )}
    </div>
  );
}
