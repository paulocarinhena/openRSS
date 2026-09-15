import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { getSession } from "@/lib/session";
import { AuthForm, AuthSwitch } from "../auth-form";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("login") };
}

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const [users, settings, t] = await Promise.all([db.user.count(), getAppSettings(), getTranslations("auth")]);
  if (users === 0) redirect("/register");

  return (
    <>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
      {settings.allowRegistration && <AuthSwitch href="/register" label={t("noAccount")} />}
    </>
  );
}
