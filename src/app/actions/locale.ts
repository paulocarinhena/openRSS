"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isSetupRequired } from "@/lib/env";
import { getSession } from "@/lib/session";
import { isLocale } from "@/i18n/config";
import { writeLocaleCookie } from "@/i18n/cookie";

/** Troca o idioma da interface: cookie sempre; banco quando há usuário logado. */
export async function setLocaleAction(input: string) {
  if (!isLocale(input)) return { ok: false as const };
  await writeLocaleCookie(input);

  if (!isSetupRequired()) {
    const session = await getSession().catch(() => null);
    if (session) {
      await db.userSettings.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id, uiLanguage: input },
        update: { uiLanguage: input },
      });
    }
  }

  revalidatePath("/", "layout");
  return { ok: true as const };
}
