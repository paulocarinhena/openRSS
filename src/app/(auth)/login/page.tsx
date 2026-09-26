import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { getSession } from "@/lib/session";
import { publicOidcInfo } from "@/lib/oidc";
import { isMailConfigured } from "@/lib/mail";
import { AuthForm, AuthSwitch } from "../auth-form";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("login") };
}

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const [users, settings, t] = await Promise.all([db.user.count(), getAppSettings(), getTranslations("auth")]);
  if (users === 0) redirect("/register");
  const sso = publicOidcInfo();

  return (
    <>
      <Suspense>
        <AuthForm mode="login" sso={sso} />
      </Suspense>
      {isMailConfigured() && !sso?.passwordLoginDisabled && <AuthSwitch href="/forgot-password" label={t("forgotPassword")} />}
      {settings.allowRegistration && !sso?.passwordLoginDisabled && <AuthSwitch href="/register" label={t("noAccount")} />}
    </>
  );
}
