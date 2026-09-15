import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { getSession } from "@/lib/session";
import { Card } from "@/components/ui/input";
import { AuthForm, AuthSwitch } from "../auth-form";

export const metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/");
  const [users, settings] = await Promise.all([db.user.count(), getAppSettings()]);
  const firstUser = users === 0;

  if (!firstUser && !settings.allowRegistration) {
    return (
      <>
        <Card>
          <h1 className="text-base font-semibold">Cadastro fechado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Peça a um administrador para criar sua conta.
          </p>
        </Card>
        <AuthSwitch href="/login" label="Voltar para o login" />
      </>
    );
  }

  return (
    <>
      <Suspense>
        <AuthForm mode="register" firstUser={firstUser} />
      </Suspense>
      {!firstUser && <AuthSwitch href="/login" label="Já tem conta? Entrar" />}
    </>
  );
}
