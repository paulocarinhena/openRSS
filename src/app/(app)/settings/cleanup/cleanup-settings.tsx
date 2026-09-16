"use client";

import { CalendarClock, CircleHelp, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateRetentionDaysAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, Input } from "@/components/ui/input";

export function CleanupSettings({ retentionDays }: { retentionDays: number }) {
  const t = useTranslations("settings.cleanup");
  const [days, setDays] = useState(retentionDays);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateRetentionDaysAction(days);
      if (result.ok) toast.success(t("saved"));
      else toast.error(result.error);
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Card className="grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <label htmlFor="retention-days" className="text-xs font-medium text-foreground">{t("daysLabel")}</label>
              <span className="group relative inline-flex">
                <button
                  type="button"
                  aria-label={t("moreInfo")}
                  aria-describedby="retention-help"
                  className="flex size-4 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <CircleHelp className="size-3.5" />
                </button>
                <span
                  id="retention-help"
                  role="tooltip"
                  className="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-input border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-foreground opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:top-1/2 sm:left-full sm:mt-0 sm:ml-2 sm:translate-x-0 sm:-translate-y-1/2"
                >
                  {t("description")} {t("schedule")}
                </span>
              </span>
            </div>
            <Input
              id="retention-days"
              type="number"
              min={1}
              max={3650}
              step={1}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              required
            />
            <p className="text-[0.6875rem] text-muted-foreground">{t("daysHint")}</p>
          </div>

          <div className="flex gap-3 pb-0.5 text-sm text-muted-foreground">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>{t("schedule")}</p>
          </div>

        <div className="flex items-start gap-3 rounded-input border border-success/20 bg-success/5 px-4 py-3 text-sm sm:col-span-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <div>
            <p className="font-medium text-foreground">{t("savedProtectedTitle")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("savedProtectedHint")}</p>
          </div>
        </div>
      </Card>

      <div>
        <Button type="submit" variant="primary" disabled={pending || days === retentionDays}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
