import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isSetupRequired } from "@/lib/env";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, defaultLocale, isLocale, pickLocale } from "@/i18n/config";

const PUBLIC_PATHS = ["/login", "/register", "/setup"];

// Checagem otimista (só presença do cookie). A validação real da sessão
// acontece em cada página / server action via requireUser().
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Enquanto o banco não estiver configurado, só o assistente de instalação existe.
  const setupRequired = isSetupRequired();
  const isSetup = pathname === "/setup";
  if (setupRequired && !isSetup) return NextResponse.redirect(new URL("/setup", request.url));
  if (!setupRequired && isSetup) return NextResponse.redirect(new URL("/", request.url));

  const hasSession = Boolean(getSessionCookie(request));
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/" || request.nextUrl.search) url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  // Primeira visita: fixa o idioma da interface a partir do navegador (o usuário pode trocar depois).
  if (!isLocale(request.cookies.get(LOCALE_COOKIE)?.value)) {
    response.cookies.set({
      name: LOCALE_COOKIE,
      value: pickLocale(request.headers.get("accept-language")) ?? defaultLocale,
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
    });
  }
  return response;
}

export const config = {
  // Manifest, service worker e página offline são públicos: o navegador os busca sem cookie.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)"],
};
