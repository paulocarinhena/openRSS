"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updateProfileAction, updateSettingsAction } from "@/app/actions/settings";
import { isLocale, localeLabels, locales, type Locale } from "@/i18n/config";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Card, Field, Input, Label, Switch } from "@/components/ui/input";
import { LayoutGrid, List, Rows3 } from "lucide-react";

const SHORTCUTS = [
  ["j / k", "nextPrev"],
  ["o", "openOriginal"],
  ["m", "toggleRead"],
  ["s", "save"],
  ["Shift + A", "markAllRead"],
  ["/", "search"],
  ["Esc", "closeReader"],
] as const;

export function GeneralForm(props: {
  name: string;
  email: string;
  language: string;
  uiLanguage: string;
  timezone: string;
  listView: string;
  groupStories: boolean;
  timezones: string[];
}) {
  const t = useTranslations("settings.general");
  const tArticles = useTranslations("articles");
  const tLocale = useTranslations("locale");
  const router = useRouter();
  const [name, setName] = useState(props.name);
  const [language, setLanguage] = useState(props.language);
  const [uiLanguage, setUiLanguage] = useState<Locale>(isLocale(props.uiLanguage) ? props.uiLanguage : "pt-BR");
  const [timezone, setTimezone] = useState(props.timezone);
  const [listView, setListView] = useState(props.listView);
  const [groupStories, setGroupStories] = useState(props.groupStories);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const [a, b] = await Promise.all([
        updateProfileAction(name),
        updateSettingsAction({ language, uiLanguage, timezone, listView: listView as "cards" | "grid" | "titles", groupStories }),
      ]);
      const err = (!a.ok && a.error) || (!b.ok && b.error);
      if (err) {
        toast.error(err);
        return;
      }
      toast.success(t("saved"));
      // Re-renderiza o shell no idioma novo.
      if (uiLanguage !== props.uiLanguage) router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t("email")}>
          <Input value={props.email} disabled />
        </Field>
        <Field label={tLocale("label")} hint={tLocale("hint")}>
          <Combobox
            aria-label={tLocale("label")}
            value={uiLanguage}
            onValueChange={(v) => isLocale(v) && setUiLanguage(v)}
            options={locales.map((value) => ({ value, label: localeLabels[value] }))}
          />
        </Field>
        <Field label={t("aiLanguage")} hint={t("aiLanguageHint")}>
          <Combobox
            aria-label={t("aiLanguage")}
            value={language}
            onValueChange={setLanguage}
            options={locales.map((value) => ({ value, label: localeLabels[value] }))}
          />
        </Field>
        <Field label={t("timezone")}>
          <Combobox
            aria-label={t("timezone")}
            value={timezone}
            onValueChange={setTimezone}
            searchPlaceholder={t("timezoneSearch")}
            options={props.timezones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
          />
        </Field>
        <Field label={t("listView")}>
          <Combobox
            aria-label={t("listView")}
            value={listView}
            onValueChange={setListView}
            options={[
              { value: "cards", label: tArticles("views.cards"), description: tArticles("viewDescriptions.cards"), icon: <Rows3 /> },
              { value: "grid", label: tArticles("views.grid"), description: tArticles("viewDescriptions.grid"), icon: <LayoutGrid /> },
              { value: "titles", label: tArticles("views.titles"), description: tArticles("viewDescriptions.titles"), icon: <List /> },
            ]}
          />
        </Field>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <Label htmlFor="group-stories" className="flex flex-col gap-0.5">
            {t("groupStories")}
            <span className="font-normal text-muted-foreground">{t("groupStoriesHint")}</span>
          </Label>
          <Switch id="group-stories" checked={groupStories} onCheckedChange={setGroupStories} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">{t("theme")}</span>
          <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            <ThemeToggle /> {t("themeOptions")}
          </div>
        </div>
      </Card>
      <Card className="text-xs text-muted-foreground">
        <p className="eyebrow mb-2">{t("shortcuts")}</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {SHORTCUTS.map(([k, key]) => (
            <li key={k}>
              <kbd className="rounded border border-border px-1 font-mono">{k}</kbd> {t(`shortcutList.${key}`)}
            </li>
          ))}
        </ul>
      </Card>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
