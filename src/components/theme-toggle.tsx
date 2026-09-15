"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const order = ["light", "dark", "system"] as const;
const labels = { light: "Tema: Light", dark: "Tema: Dark", system: "Tema: sistema" };

export function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const current = (mounted ? theme : "system") as (typeof order)[number];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={labels[current]}
      aria-label={labels[current]}
      onClick={() => setTheme(order[(order.indexOf(current) + 1) % order.length])}
    >
      <Icon />
    </Button>
  );
}
