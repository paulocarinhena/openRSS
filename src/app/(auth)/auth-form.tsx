"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/input";

export function AuthForm({ mode, firstUser }: { mode: "login" | "register"; firstUser?: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    try {
      const { error } =
        mode === "login"
          ? await signIn.email({ email, password })
          : await signUp.email({ email, password, name: String(form.get("name")) });

      if (error) {
        // Códigos conhecidos (do better-auth ou nossos) são traduzidos; o resto usa a mensagem do servidor.
        const code = (error.code ? `errors.${error.code}` : "") as Parameters<typeof t>[0];
        setError(code && t.has(code) ? t(code) : (error.message ?? t("errors.generic")));
        return;
      }
    } catch {
      setError(t("errors.network"));
      return;
    } finally {
      setPending(false);
    }
    const next = params.get("next");
    let destination = "/";
    if (next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
      const url = new URL(next, window.location.origin);
      if (url.origin === window.location.origin) destination = `${url.pathname}${url.search}${url.hash}`;
    }
    router.replace(destination);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-base font-semibold tracking-tight">{mode === "login" ? t("login") : t("register")}</h1>
        {firstUser && <p className="mt-1 text-xs text-muted-foreground">{t("firstUser")}</p>}
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "register" && (
          <Field label={t("name")}>
            <Input name="name" required autoComplete="name" />
          </Field>
        )}
        <Field label={t("email")}>
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label={t("password")}>
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </Field>
        {error && <p role="alert" aria-live="assertive" className="text-xs text-destructive">{error}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? t("wait") : mode === "login" ? t("login") : t("register")}
        </Button>
      </form>
    </Card>
  );
}

export function AuthSwitch({ href, label }: { href: string; label: string }) {
  return (
    <p className="mt-4 text-center text-xs text-muted-foreground">
      <Link href={href} className="underline underline-offset-2 hover:text-foreground">
        {label}
      </Link>
    </p>
  );
}
