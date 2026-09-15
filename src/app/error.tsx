"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors");
  return (
    <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center">
      <TriangleAlert className="size-6 text-destructive" aria-hidden />
      <div>
        <h1 className="font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Button variant="primary" onClick={() => retry()}>
        {t("retry")}
      </Button>
    </div>
  );
}
