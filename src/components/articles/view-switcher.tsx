"use client";

import { LayoutGrid, List, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

import type { ListView } from "@/lib/list-view";

export type { ListView };

export const LIST_VIEWS = [
  { value: "cards", label: "Cartões", icon: Rows3 },
  { value: "grid", label: "Grade", icon: LayoutGrid },
  { value: "titles", label: "Só texto", icon: List },
] as const satisfies readonly { value: ListView; label: string; icon: typeof Rows3 }[];

/** Controle segmentado de visualização com indicador deslizante. */
export function ViewSwitcher({ value, onChange }: { value: ListView; onChange: (value: ListView) => void }) {
  const index = Math.max(0, LIST_VIEWS.findIndex((v) => v.value === value));

  return (
    <div role="radiogroup" aria-label="Visualização" className="relative flex shrink-0 rounded-control bg-muted p-0.5">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-7 rounded-control bg-surface shadow-control ring-1 ring-border transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-white/12"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {LIST_VIEWS.map((v) => {
        const Icon = v.icon;
        const active = v.value === value;
        return (
          <button
            key={v.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={v.label}
            title={v.label}
            onClick={() => onChange(v.value)}
            className={cn(
              "relative z-10 flex size-7 cursor-pointer items-center justify-center rounded-control transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
