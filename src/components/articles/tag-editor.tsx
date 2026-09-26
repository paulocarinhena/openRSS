"use client";

import { Plus, Tag as TagIcon, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addTagAction, listTagsAction, removeTagAction } from "@/app/actions/tags";
import { Combobox } from "@/components/ui/combobox";

type Tag = { id: string; name: string };

/** Tags do artigo no leitor. Adicionar uma tag também salva o artigo. */
export function TagEditor({ articleId, initial, onSavedChange }: { articleId: string; initial: Tag[]; onSavedChange?: () => void }) {
  const t = useTranslations("tags");
  const [tags, setTags] = useState(initial);
  const [options, setOptions] = useState<Tag[] | null>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function add(name: string) {
    const clean = name.trim();
    if (!clean || tags.some((tag) => tag.name === clean)) return setValue("");
    start(async () => {
      const res = await addTagAction(articleId, clean);
      setValue("");
      if (!res.ok) return void toast.error(res.error);
      setTags((prev) => [...prev, res.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setOptions(null);
      onSavedChange?.();
    });
  }

  function remove(tag: Tag) {
    setTags((prev) => prev.filter((x) => x.id !== tag.id));
    start(async () => void (await removeTagAction(articleId, tag.id)));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TagIcon className="size-3.5 text-muted-foreground" aria-hidden />
      {tags.map((tag) => (
        <span key={tag.id} className="inline-flex items-center gap-0.5 rounded-full border border-border bg-secondary py-0.5 pr-1 pl-2 text-xs">
          {tag.name}
          <button
            type="button"
            aria-label={t("remove", { name: tag.name })}
            onClick={() => remove(tag)}
            className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Combobox
        size="sm"
        allowCustom
        searchable
        className="w-auto min-w-28"
        aria-label={t("add")}
        placeholder={t("add")}
        value={value}
        disabled={pending}
        loading={open && options === null}
        onOpenChange={(next) => {
          setOpen(next);
          if (next && options === null) void listTagsAction().then((list) => setOptions(list));
        }}
        onValueChange={add}
        options={(options ?? [])
          .filter((o) => !tags.some((tag) => tag.id === o.id))
          .map((o) => ({ value: o.name, label: o.name, icon: <Plus /> }))}
      />
    </div>
  );
}
