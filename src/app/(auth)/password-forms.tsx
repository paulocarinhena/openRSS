"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/input";

/** Pede o e-mail de redefinição. A resposta é sempre a mesma, para não revelar quais e-mails existem. */
export function ForgotPasswordForm() {
  const t = useTranslations("auth.reset");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }).catch(() => null);
    setPending(false);
    setSent(true);
  }

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-base font-semibold tracking-tight">{t("forgotTitle")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{sent ? t("sent") : t("forgotDescription")}</p>
      </div>
      {!sent && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label={t("email")}>
            <Input name="email" type="email" required autoComplete="email" autoFocus />
          </Field>
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending ? t("wait") : t("send")}
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Define a nova senha a partir do link do e-mail (?token=…). */
export function ResetPasswordForm() {
  const t = useTranslations("auth.reset");
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [error, setError] = useState<string | null>(linkError || !token ? t("invalidLink") : null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) return setError(t("mismatch"));
    setError(null);
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! }).catch(() => ({ error: { message: t("failed") } }));
    setPending(false);
    if (error) return setError(error.message ?? t("failed"));
    router.replace("/login?reset=1");
  }

  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-base font-semibold tracking-tight">{t("newTitle")}</h1>
      {token && !linkError && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label={t("newPassword")}>
            <Input name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus />
          </Field>
          <Field label={t("confirm")}>
            <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending ? t("wait") : t("save")}
          </Button>
        </form>
      )}
      {(!token || linkError) && error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </Card>
  );
}
