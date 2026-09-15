import Link from "next/link";
import { Newspaper, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getUserSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { Card } from "@/components/ui/input";
import { GenerateDigestButton } from "./generate-button";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("digest") };
}

export default async function DigestPage({ searchParams }: PageProps<"/digest">) {
  const user = await requireUser();
  const { day } = await searchParams;
  const [digests, settings, providers, t, locale] = await Promise.all([
    db.digest.findMany({ where: { userId: user.id }, orderBy: { day: "desc" }, take: 30, select: { id: true, day: true } }),
    getUserSettings(user.id),
    db.aiProvider.count({ where: { enabled: true, OR: [{ userId: user.id }, { userId: null }] } }),
    getTranslations("digest"),
    getLocale(),
  ]);
  const current = await db.digest.findFirst({
    where: { userId: user.id, ...(typeof day === "string" ? { day } : {}) },
    orderBy: { day: "desc" },
  });

  const settingsLink = (chunks: React.ReactNode) => (
    <Link href="/settings/ai" className="underline underline-offset-2">
      {chunks}
    </Link>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <p className="eyebrow flex items-center gap-1.5">
              <Sparkles className="size-3 text-ai" /> {t("eyebrow")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight dark:font-normal">
              {current ? formatDay(current.day, locale) : t("heading")}
            </h1>
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

        {digests.length > 1 && (
          <nav className="flex flex-wrap gap-2">
            {digests.map((d) => (
              <Link
                key={d.id}
                href={`/digest?day=${d.day}`}
                className="rounded-control border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-accent aria-[current=true]:text-foreground"
                aria-current={d.day === current?.day}
              >
                {d.day}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function formatDay(day: string, locale: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
