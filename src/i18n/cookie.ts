import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./config";

/** Só em Server Actions / Route Handlers (cookies().set não é permitido durante render). */
export async function writeLocaleCookie(locale: Locale) {
  (await cookies()).set({
    name: LOCALE_COOKIE,
    value: locale,
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
  });
}
