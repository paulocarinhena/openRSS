import Link from "next/link";
import { Newspaper, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getUserSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Card } from "@/components/ui/input";
import { GenerateDigestButton } from "./generate-button";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("digest") };
}

export default async function DigestPage({ searchParams }: PageProps<"/digest">) {
  const user = await requireUser();
  const { id } = await searchParams;
  const [digests, settings, providers, t, locale] = await Promise.all([
    db.digest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, day: true, createdAt: true } }),
    getUserSettings(user.id),
    db.aiProvider.count({ where: { enabled: true, OR: [{ userId: user.id }, { userId: null }] } }),
    getTranslations("digest"),
    getLocale(),
  ]);
  const currentId = typeof id === "string" && id ? id : digests[0]?.id;
  const current = currentId ? await db.digest.findFirst({ where: { id: currentId, userId: user.id } }) : null;

  const settingsLink = (chunks: React.ReactNode) => (
    <Link href="/settings/ai" className="underline underline-offset-2">
      {chunks}
    </Link>
  );

  return (
    <div className="flex h-full min-h-0">
      <section className="hidden w-72 shrink-0 flex-col border-r border-border xl:flex">
        <div className="border-b border-border px-4 py-3">
          <p className="eyebrow flex items-center gap-1.5">
            <Sparkles className="size-3 text-ai" /> {t("eyebrow")}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {digests.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {digests.map((d) => {
                const active = d.id === current?.id;
                return (
                  <li key={d.id}>
                    <Link
                      href={`/digest?id=${d.id}`}
                      aria-current={active || undefined}
                      className={cn("flex flex-col gap-0.5 px-4 py-3 transition-colors duration-200 hover:bg-accent", active && "bg-accent")}
                    >
                      <span className="text-sm font-medium text-foreground">{formatShortDay(d.createdAt, locale, settings.timezone)}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(d.createdAt, locale, settings.timezone)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
          <header className="flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <p className="eyebrow flex items-center gap-1.5 xl:hidden">
                <Sparkles className="size-3 text-ai" /> {t("eyebrow")}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight dark:font-normal">
                {current ? formatDay(current.day, locale) : t("heading")}
              </h1>
              {current && <p className="text-xs text-muted-foreground">{formatTime(current.createdAt, locale, settings.timezone)}</p>}
            </div>
            <GenerateDigestButton disabled={providers === 0} />
          </header>

          {providers === 0 && <Card className="text-sm text-muted-foreground">{t.rich("configureProvider", { link: settingsLink })}</Card>}

          {!settings.digestEnabled && providers > 0 && (
            <p className="text-xs text-muted-foreground">{t.rich("autoDisabled", { link: settingsLink })}</p>
          )}

          {current ? (
            <Card>
              <Markdown className="max-w-none">{current.content}</Markdown>
              {current.model && <p className="mt-4 font-mono text-[0.6875rem] text-muted-foreground">{current.model}</p>}
            </Card>
          ) : (
            <Card className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Newspaper className="size-6" />
              {t("none")}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDay(day: string, locale: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function formatShortDay(date: Date, locale: string, timeZone: string) {
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone });
}

function formatTime(date: Date, locale: string, timeZone: string) {
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone });
}
