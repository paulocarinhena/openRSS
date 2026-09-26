"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { localizeError } from "@/lib/localized-error";
import { saveLink } from "@/lib/feeds/saved-links";

/** Salva um link avulso em "Salvos" (lendo a página no modo leitura). */
export async function saveLinkAction(url: string): Promise<{ ok: true; articleId: string; existed: boolean } | { ok: false; error: string }> {
  const user = await requireUser();
  const t = await getTranslations("links");
  try {
    const result = await saveLink(user.id, String(url ?? ""), t("feedTitle"));
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof Error && err.message === "invalidUrl") return { ok: false, error: t("invalidUrl") };
    return { ok: false, error: localizeError(err, await getLocale()) };
  }
}
