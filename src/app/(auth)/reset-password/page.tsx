import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthSwitch } from "../auth-form";
import { ResetPasswordForm } from "../password-forms";

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
      <AuthSwitch href="/login" label={t("backToLogin")} />
    </>
  );
}
