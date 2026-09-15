import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isSetupRequired } from "@/lib/env";

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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)"],
};
