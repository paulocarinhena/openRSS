import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isMailConfigured } from "@/lib/mail";
import { AuthSwitch } from "../auth-form";
import { ForgotPasswordForm } from "../password-forms";

export default async function ForgotPasswordPage() {
  // Sem SMTP não há como enviar o link: quem esqueceu a senha fala com o admin.
  if (!isMailConfigured()) redirect("/login");
  const t = await getTranslations("auth");
  return (
    <>
      <ForgotPasswordForm />
      <AuthSwitch href="/login" label={t("backToLogin")} />
    </>
  );
}
