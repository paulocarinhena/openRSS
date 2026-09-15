import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { getSession } from "@/lib/session";
import { AuthForm, AuthSwitch } from "../auth-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const [users, settings] = await Promise.all([db.user.count(), getAppSettings()]);
  if (users === 0) redirect("/register");

  return (
    <>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
      {settings.allowRegistration && <AuthSwitch href="/register" label="Não tem conta? Cadastre-se" />}
    </>
  );
}
