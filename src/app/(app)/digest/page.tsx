import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getUserSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { DigestView } from "./digest-view";
import { formatShortDay, formatTime } from "./format";

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
          <DigestView
            current={current}
            providersAvailable={providers > 0}
            digestEnabled={settings.digestEnabled}
            locale={locale}
            timezone={settings.timezone}
          />
        </div>
      </div>
    </div>
  );
}
