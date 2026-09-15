"use client";

import { Popover } from "radix-ui";
import { Check, ChevronsUpDown, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

/** Remove acentos e caixa para a busca. */
const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Limite de itens renderizados (listas grandes, ex.: centenas de modelos). */
const MAX_RENDERED = 300;

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Selecione…",
  searchPlaceholder = "Buscar…",
  emptyText = "Nenhum resultado.",
  searchable,
  allowCustom,
  loading,
  loadingText = "Carregando…",
  onOpenChange: onOpenChangeProp,
  disabled,
  size = "md",
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: React.ReactNode;
  /** Mostra campo de busca. Padrão: automático quando há mais de 8 opções (sempre com allowCustom). */
  searchable?: boolean;
  /** Permite usar o texto digitado como valor quando não estiver na lista. */
  allowCustom?: boolean;
  loading?: boolean;
  loadingText?: string;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const showSearch = searchable ?? (allowCustom || options.length > 8);
  const selected = options.find((o) => o.value === value);
  const triggerLabel = selected?.label ?? (allowCustom && value ? value : null);

  const items = useMemo(() => {
    const q = normalize(query.trim());
    const filtered = q ? options.filter((o) => normalize(`${o.label} ${o.description ?? ""} ${o.value}`).includes(q)) : options;
    const list = filtered.slice(0, MAX_RENDERED);
    const selectedOutsideLimit = !q && filtered.find((o, index) => index >= MAX_RENDERED && o.value === value);
    if (selectedOutsideLimit) list.push(selectedOutsideLimit);
    const renderedFiltered = list.length;
    const typed = query.trim();
    if (allowCustom && typed && !options.some((o) => o.value === typed)) {
      list.push({ value: typed, label: `Usar “${typed}”`, icon: <Plus /> });
    }
    return { list, hidden: Math.max(0, filtered.length - renderedFiltered) };
  }, [allowCustom, options, query, value]);
  const filtered = items.list;

  function onOpenChange(next: boolean) {
    setOpen(next);
    onOpenChangeProp?.(next);
    if (next) {
      const selectedIndex = options.findIndex((o) => o.value === value);
      setQuery("");
      setActive(selectedIndex >= MAX_RENDERED ? MAX_RENDERED : Math.max(0, selectedIndex));
    }
  }

  // Mantém a opção ativa visível ao navegar pelo teclado.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(option: ComboboxOption | undefined) {
    if (!option || option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
    onOpenChangeProp?.(false);
  }

  function step(from: number, delta: number) {
    if (filtered.length === 0) return 0;
    let i = from;
    for (let n = 0; n < filtered.length; n++) {
      i = (i + delta + filtered.length) % filtered.length;
      if (!filtered[i].disabled) return i;
    }
    return from;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => step(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => step(i, -1));
        break;
      case "Home":
        if (showSearch) return;
        e.preventDefault();
        setActive(step(-1, 1));
        break;
      case "End":
        if (showSearch) return;
        e.preventDefault();
        setActive(step(filtered.length, -1));
        break;
      case "Enter":
        e.preventDefault();
        choose(filtered[active]);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className={cn(
            "group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-input border border-input bg-background px-3 text-left text-sm text-foreground shadow-control outline-none transition-colors duration-200",
            "hover:border-ring/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
            "data-[state=open]:border-ring data-[state=open]:ring-3 data-[state=open]:ring-ring/20 dark:bg-secondary",
            size === "sm" ? "h-8" : "h-9",
            className,
          )}
        >
          {selected?.icon && <span className="flex shrink-0 items-center [&_svg]:size-4">{selected.icon}</span>}
          <span className={cn("min-w-0 flex-1 truncate", !triggerLabel && "text-muted-foreground")}>{triggerLabel ?? placeholder}</span>
          {loading ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(e) => {
            // Sem busca, o foco vai para a lista para o teclado funcionar.
            if (!showSearch) {
              e.preventDefault();
              listRef.current?.focus();
            }
          }}
          className={cn(
            "z-50 flex max-h-[min(22rem,var(--radix-popover-content-available-height))] w-[max(var(--radix-popover-trigger-width),14rem)] flex-col overflow-hidden",
            "rounded-input border border-border bg-surface text-surface-foreground shadow-card dark:shadow-none",
            "origin-(--radix-popover-content-transform-origin) animate-[combobox-in_140ms_ease-out]",
          )}
        >
          {showSearch && (
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-haspopup="listbox"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
            </div>
          )}

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-busy={loading || undefined}
            aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
            className="min-h-0 flex-1 overflow-y-auto p-1 outline-none"
          >
            {loading && options.length === 0 && (
              <li role="status" className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {loadingText}
              </li>
            )}
            {!loading && filtered.length === 0 && <li role="status" className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</li>}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <li
                  key={`${o.value}-${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  data-index={i}
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  onPointerMove={() => !o.disabled && setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-100 select-none",
                    i === active && "bg-accent text-accent-foreground",
                    isSelected && "font-medium",
                    o.disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  {o.icon && <span className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-4">{o.icon}</span>}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.description && <span className="truncate text-[0.6875rem] font-normal text-muted-foreground">{o.description}</span>}
                  </span>
                  <Check className={cn("size-3.5 shrink-0 text-primary", isSelected ? "opacity-100" : "opacity-0")} />
                </li>
              );
            })}
            {items.hidden > 0 && (
              <li className="px-3 py-2 text-center text-[0.6875rem] text-muted-foreground">
                +{items.hidden} itens — refine a busca
              </li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
