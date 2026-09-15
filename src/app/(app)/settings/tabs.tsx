"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/settings", label: "Geral" },
    { href: "/settings/feeds", label: "Feeds" },
    { href: "/settings/ai", label: "IA" },
    ...(isAdmin ? [{ href: "/settings/admin", label: "Admin" }] : []),
  ];
  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground",
            pathname === t.href && "border-primary font-medium text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
