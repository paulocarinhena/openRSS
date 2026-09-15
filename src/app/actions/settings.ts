"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const schema = z.object({
  aiProviderId: z.string().nullable().optional(),
  aiModel: z.string().trim().max(200).nullable().optional(),
  language: z.string().min(2).max(10).optional(),
  interests: z.string().max(4000).nullable().optional(),
  classifyEnabled: z.boolean().optional(),
  digestEnabled: z.boolean().optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", "Fuso inválido.").optional(),
  listView: z.enum(["cards", "grid", "titles"]).optional(),
});

export async function updateSettingsAction(input: z.input<typeof schema>) {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  if (data.aiProviderId) {
    const allowed = await db.aiProvider.count({ where: { id: data.aiProviderId, OR: [{ userId: user.id }, { userId: null }] } });
    if (!allowed) return { ok: false as const, error: "Provedor inválido." };
  }

  await db.userSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function updateProfileAction(name: string) {
  const user = await requireUser();
  const value = z.string().trim().min(1).max(80).safeParse(name);
  if (!value.success) return { ok: false as const, error: "Nome inválido." };
  await db.user.update({ where: { id: user.id }, data: { name: value.data } });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
