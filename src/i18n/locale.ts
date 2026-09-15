import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { isSetupRequired } from "@/lib/env";
import { getSession } from "@/lib/session";
import { LOCALE_COOKIE, defaultLocale, isLocale, pickLocale, type Locale } from "./config";

/**
 * Locale da requisição atual: preferência do usuário logado > cookie > Accept-Language > padrão.
 * Cacheado por requisição (React cache), como o getSession.
 */
export const resolveRequestLocale = cache(async (): Promise<Locale> => {
  // Em modo setup não há banco nem auth; só cookie e header.
  if (!isSetupRequired()) {
    const session = await getSession().catch(() => null);
    if (session) {
      const row = await db.userSettings.findUnique({ where: { userId: session.user.id }, select: { uiLanguage: true } });
      if (row && isLocale(row.uiLanguage)) return row.uiLanguage;
    }
  }

  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;

  return pickLocale((await headers()).get("accept-language")) ?? defaultLocale;
});
