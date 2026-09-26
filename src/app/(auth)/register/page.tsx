import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { getSession } from "@/lib/session";
import { publicOidcInfo } from "@/lib/oidc";
import { Card } from "@/components/ui/input";
import { AuthForm, AuthSwitch } from "../auth-form";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("register") };
}

export default async function RegisterPage() {
  if (await getSession()) redirect("/");
  const [users, settings, t] = await Promise.all([db.user.count(), getAppSettings(), getTranslations("auth")]);
  const firstUser = users === 0;
  const sso = publicOidcInfo();

  if (!firstUser && !settings.allowRegistration) {
    return (
      <>
        <Card>
          <h1 className="text-base font-semibold">{t("registrationClosed")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("registrationClosedHint")}</p>
        </Card>
        <AuthSwitch href="/login" label={t("backToLogin")} />
      </>
    );
  }

  return (
    <>
      <Suspense>
        <AuthForm mode="register" firstUser={firstUser} sso={sso} />
      </Suspense>
      {!firstUser && <AuthSwitch href="/login" label={t("haveAccount")} />}
    </>
  );
}
