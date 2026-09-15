"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { generateDigestAction } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";

export function GenerateDigestButton({ disabled }: { disabled?: boolean }) {
  const t = useTranslations("digest");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="primary"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const res = await generateDigestAction();
          if (res.ok) {
            toast.success(t("generated"));
            router.push(`/digest?id=${res.id}`);
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {pending ? t("generating") : t("generateNow")}
    </Button>
  );
}
