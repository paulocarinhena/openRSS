"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("settings.tabs");
  const pathname = usePathname();
  const tabs = [
    { href: "/settings", label: t("general") },
    { href: "/settings/feeds", label: t("feeds") },
    { href: "/settings/ai", label: t("ai") },
    { href: "/settings/rules", label: t("rules") },
    { href: "/settings/apps", label: t("apps") },
    ...(isAdmin ? [{ href: "/settings/cleanup", label: t("cleanup") }] : []),
    ...(isAdmin ? [{ href: "/settings/admin", label: t("admin") }] : []),
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground",
            pathname === tab.href && "border-primary font-medium text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
