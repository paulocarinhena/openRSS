"use client";

import Link from "next/link";
import { Newspaper, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { generateDigestAction } from "@/app/actions/ai";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/input";
import { formatDay, formatTime } from "./format";

const SKELETON = ["96%", "88%", "92%", "70%", "84%"];

export function DigestView({
  current,
  providersAvailable,
  digestEnabled,
  locale,
  timezone,
}: {
  current: { day: string; createdAt: Date; content: string; model: string | null } | null;
  providersAvailable: boolean;
  digestEnabled: boolean;
  locale: string;
  timezone: string;
}) {
  const t = useTranslations("digest");
  const router = useRouter();
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const res = await generateDigestAction();
      if (res.ok) {
        toast.success(t("generated"));
        router.push(`/digest?id=${res.id}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const settingsLink = (chunks: React.ReactNode) => (
    <Link href="/settings/ai" className="underline underline-offset-2">
      {chunks}
    </Link>
  );

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="eyebrow flex items-center gap-1.5 xl:hidden">
            <Sparkles className="size-3 text-ai" /> {t("eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight dark:font-normal">{current ? formatDay(current.day, locale) : t("heading")}</h1>
          {current && <p className="text-xs text-muted-foreground">{formatTime(current.createdAt, locale, timezone)}</p>}
        </div>
        <Button variant="primary" disabled={!providersAvailable || pending} onClick={generate}>
          <Sparkles className={cn("text-ai", pending && "animate-[ai-twinkle_1.6s_ease-in-out_infinite]")} />
          {pending ? t("generating") : t("generateNow")}
        </Button>
      </header>

      {!providersAvailable && <Card className="text-sm text-muted-foreground">{t.rich("configureProvider", { link: settingsLink })}</Card>}

      {!digestEnabled && providersAvailable && <p className="text-xs text-muted-foreground">{t.rich("autoDisabled", { link: settingsLink })}</p>}

      {pending ? (
        <Card
          aria-live="polite"
          aria-busy
          className="ai-panel relative animate-[ai-panel-in_360ms_cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden border-ai/25 bg-[color-mix(in_oklab,var(--ai)_5%,var(--surface))]"
        >
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
            <div className="h-full w-2/5 animate-[ai-progress_1.5s_cubic-bezier(0.4,0,0.2,1)_infinite] rounded-full bg-ai" />
          </div>
          <div className="flex items-center gap-2.5 pb-4">
            <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-ai/12 text-ai">
              <span aria-hidden className="absolute inset-0 animate-[ai-halo_1.8s_ease-out_infinite] rounded-full bg-ai/25" />
              <Sparkles className="relative size-3.5 animate-[ai-twinkle_1.6s_ease-in-out_infinite]" />
            </span>
            <p className="text-xs font-semibold tracking-tight text-foreground">{t("generating")}</p>
          </div>
          <div className="flex flex-col gap-2.5 py-1.5" aria-hidden>
            {SKELETON.map((width, i) => (
              <div key={i} className="ai-shimmer h-2.5 rounded-full" style={{ width, animationDelay: `${i * 140}ms` }} />
            ))}
          </div>
        </Card>
      ) : current ? (
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
    </>
  );
}
