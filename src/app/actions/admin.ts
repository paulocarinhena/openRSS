"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";

const appSchema = z.object({
  allowRegistration: z.boolean(),
  refreshIntervalMinutes: z.number().int().min(5).max(1440),
  retentionDays: z.number().int().min(7).max(3650),
});

export async function updateAppSettingsAction(input: z.input<typeof appSchema>) {
  await requireAdmin();
  const parsed = appSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  await db.appSettings.upsert({ where: { id: "app" }, create: { id: "app", ...parsed.data }, update: parsed.data });
  revalidatePath("/settings/admin");
  return { ok: true as const };
}

const userSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório."),
  email: z.email("Email inválido."),
  password: z.string().min(8, "Senha com no mínimo 8 caracteres."),
  role: z.enum(["user", "admin"]),
});

export async function createUserAction(input: z.input<typeof userSchema>) {
  await requireAdmin();
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { role, ...body } = parsed.data;
  try {
    // Chamada server-side (sem request): não é bloqueada pelo "cadastro fechado" e não cria sessão.
    const res = await auth.api.signUpEmail({ body });
    await db.user.update({ where: { id: res.user.id }, data: { role } });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Não foi possível criar o usuário." };
  }
  revalidatePath("/settings/admin");
  return { ok: true as const };
}

export async function setUserRoleAction(userId: string, role: "user" | "admin") {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false as const, error: "Você não pode alterar seu próprio papel." };
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/settings/admin");
  return { ok: true as const };
}

export async function deleteUserAction(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false as const, error: "Você não pode excluir a si mesmo." };
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/settings/admin");
  return { ok: true as const };
}
