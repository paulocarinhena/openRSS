"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";
import { actionErrorMessage } from "@/lib/action-errors";
import { emailLayout, escapeHtml, sendMail } from "@/lib/mail";
import { staticTranslator } from "@/i18n/static";

const appSchema = z.object({
  allowRegistration: z.boolean(),
  refreshIntervalMinutes: z.number().int().min(5).max(1440),
});

export async function updateAppSettingsAction(input: z.input<typeof appSchema>) {
  await requireAdmin();
  const parsed = appSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: actionErrorMessage(await getTranslations("admin.errors"), parsed.error) };
  await db.appSettings.upsert({ where: { id: "app" }, create: { id: "app", ...parsed.data }, update: parsed.data });
  revalidatePath("/settings/admin");
  return { ok: true as const };
}

const retentionSchema = z.number().int().min(1).max(3650);

export async function updateRetentionDaysAction(input: number) {
  await requireAdmin();
  const parsed = retentionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: (await getTranslations("settings.cleanup"))("invalidDays") };
  await db.appSettings.upsert({
    where: { id: "app" },
    create: { id: "app", retentionDays: parsed.data },
    update: { retentionDays: parsed.data },
  });
  revalidatePath("/settings/cleanup");
  return { ok: true as const };
}

// Mensagens do zod são chaves de admin.errors.
const userSchema = z.object({
  name: z.string().trim().min(1, "nameRequired"),
  email: z.email("invalidEmail"),
  password: z.string().min(8, "passwordTooShort"),
  role: z.enum(["user", "admin"]),
});

export async function createUserAction(input: z.input<typeof userSchema>) {
  await requireAdmin();
  const t = await getTranslations("admin.errors");
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: actionErrorMessage(t, parsed.error) };
  const { role, ...body } = parsed.data;
  try {
    // Chamada server-side (sem request): não é bloqueada pelo "cadastro fechado" e não cria sessão.
    const res = await auth.api.signUpEmail({ body });
    await db.user.update({ where: { id: res.user.id }, data: { role } });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : t("createUserFailed") };
  }
  revalidatePath("/settings/admin");
  return { ok: true as const };
}

export async function setUserRoleAction(userId: string, role: "user" | "admin") {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false as const, error: (await getTranslations("admin.errors"))("ownRole") };
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/settings/admin");
  return { ok: true as const };
}

export async function deleteUserAction(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false as const, error: (await getTranslations("admin.errors"))("ownDelete") };
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/settings/admin");
  return { ok: true as const };
}

/** Envia um e-mail de teste para o próprio admin, para conferir a configuração SMTP. */
export async function sendTestEmailAction() {
  const admin = await requireAdmin();
  const t = await getTranslations("admin.mail");
  const m = staticTranslator(await getLocale(), "mail.test");
  try {
    await sendMail({
      to: admin.email,
      subject: m("subject"),
      text: m("body"),
      html: emailLayout({ title: m("subject"), bodyHtml: `<p>${escapeHtml(m("body"))}</p>` }),
    });
    return { ok: true as const, message: t("sent", { email: admin.email }) };
  } catch (err) {
    return { ok: false as const, error: t("failed", { reason: err instanceof Error ? err.message : String(err) }) };
  }
}
