"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/locale";
import { localeLabels, locales } from "@/i18n/config";
import { Combobox } from "@/components/ui/combobox";

/** Seletor compacto de idioma (páginas públicas). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("locale");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Combobox
      size="sm"
      className={className}
      aria-label={t("switcher")}
      value={locale}
      disabled={pending}
      loading={pending}
      onValueChange={(next) => {
        if (next === locale) return;
        start(async () => {
          await setLocaleAction(next);
          router.refresh();
        });
      }}
      options={locales.map((value) => ({ value, label: localeLabels[value], icon: <Languages /> }))}
    />
  );
}
