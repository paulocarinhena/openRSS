"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createAppPassword } from "@/lib/api/tokens";

const MAX_TOKENS = 20;

/** Cria uma senha de aplicativo; o texto é devolvido uma única vez. */
export async function createApiTokenAction(name: string) {
  const user = await requireUser();
  const t = await getTranslations("apps.errors");
  const parsed = z.string().trim().min(1).max(60).safeParse(name);
  if (!parsed.success) return { ok: false as const, error: t("nameRequired") };
  if ((await db.apiToken.count({ where: { userId: user.id } })) >= MAX_TOKENS) return { ok: false as const, error: t("tooMany", { max: MAX_TOKENS }) };
  const token = await createAppPassword(user, parsed.data);
  revalidatePath("/settings/apps");
  return { ok: true as const, password: token.password };
}

export async function revokeApiTokenAction(id: string) {
  const user = await requireUser();
  await db.apiToken.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/settings/apps");
  return { ok: true as const };
}
