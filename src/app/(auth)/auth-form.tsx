"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { signIn, signUp } from "@/lib/auth-client";
import { OIDC_PROVIDER_ID } from "@/lib/oidc";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Label } from "@/components/ui/input";

/** Só caminhos internos: evita redirecionamento aberto via ?next=. */
function safeNext(next: string | null) {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  const url = new URL(next, window.location.origin);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/";
}

export type SsoInfo = { name: string; passwordLoginDisabled: boolean } | null;

export function AuthForm({
  mode,
  firstUser,
  sso = null,
  canResetPassword = false,
}: {
  mode: "login" | "register";
  firstUser?: boolean;
  sso?: SsoInfo;
  /** Mostra "Esqueci minha senha" ao lado do campo (só com e-mail configurado). */
  canResetPassword?: boolean;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  // Erros do retorno do SSO chegam como ?error=<código>.
  const ssoError = params.get("error");
  const [error, setError] = useState<string | null>(() => {
    if (!ssoError) return null;
    const key = `errors.${ssoError}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t("errors.ssoFailed", { code: ssoError });
  });
  const [pending, setPending] = useState(false);

  async function onSso() {
    setError(null);
    setPending(true);
    const callbackURL = safeNext(params.get("next"));
    const { error } = await signIn
      .social({ provider: OIDC_PROVIDER_ID, callbackURL, errorCallbackURL: "/login", newUserCallbackURL: callbackURL })
      .catch(() => ({ error: { message: t("errors.network") } }));
    // Sem erro, o navegador já está indo para o provedor.
    if (error) {
      setError(error.message ?? t("errors.generic"));
      setPending(false);
    }
  }

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
        const code = (error.status === 429 ? "errors.tooManyRequests" : error.code ? `errors.${error.code}` : "") as Parameters<typeof t>[0];
        setError(code && t.has(code) ? t(code) : (error.message ?? t("errors.generic")));
        return;
      }
    } catch {
      setError(t("errors.network"));
      return;
    } finally {
      setPending(false);
    }
    router.replace(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-base font-semibold tracking-tight">{mode === "login" ? t("login") : t("register")}</h1>
        {firstUser && <p className="mt-1 text-xs text-muted-foreground">{t("firstUser")}</p>}
      </div>
      {params.get("reset") === "1" && !error && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("reset.done")}
        </p>
      )}
      {sso && (
        <Button type="button" size="lg" onClick={onSso} disabled={pending}>
          <KeyRound /> {t("ssoButton", { name: sso.name })}
        </Button>
      )}
      {sso && !sso.passwordLoginDisabled && (
        <div className="flex items-center gap-3 text-[0.6875rem] text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-border" /> {t("or")} <span className="h-px flex-1 bg-border" />
        </div>
      )}
      {sso?.passwordLoginDisabled ? (
        error && <p role="alert" aria-live="assertive" className="text-xs text-destructive">{error}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "register" && (
            <Field label={t("name")}>
              <Input name="name" required autoComplete="name" />
            </Field>
          )}
          <Field label={t("email")}>
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="auth-password">{t("password")}</Label>
              {mode === "login" && canResetPassword && (
                <Link href="/forgot-password" className="text-[0.6875rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  {t("forgotPassword")}
                </Link>
              )}
            </div>
            <Input
              id="auth-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && <p role="alert" aria-live="assertive" className="text-xs text-destructive">{error}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending ? t("wait") : mode === "login" ? t("login") : t("register")}
          </Button>
        </form>
      )}
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
