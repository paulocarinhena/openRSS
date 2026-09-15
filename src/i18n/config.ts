// Isomórfico: importado pelo proxy, por client components e por testes.
// Não pode importar nada de Node, banco ou "server-only".

export const locales = ["pt-BR", "en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "pt-BR";

export const LOCALE_COOKIE = "locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const localeLabels: Record<Locale, string> = {
  "pt-BR": "Português (Brasil)",
  en: "English",
  es: "Español",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Idioma-base (ex.: "pt", "en") → locale suportado. */
const byLanguage: Record<string, Locale> = { pt: "pt-BR", en: "en", es: "es" };

/**
 * Escolhe o melhor locale a partir do header Accept-Language.
 * Casa a tag exata primeiro (pt-BR), depois o idioma-base (pt-PT → pt-BR, en-GB → en).
 * Retorna null quando nenhum idioma é suportado.
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((item) => item.tag && item.tag !== "*" && item.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const { tag } of ranked) {
    const exact = locales.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = byLanguage[tag.split("-")[0]];
    if (base) return base;
  }
  return null;
}

/** Lê o cookie de locale de um header Cookie cru (route handlers / hooks sem acesso a `cookies()`). */
export function localeFromCookieHeader(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name === LOCALE_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return isLocale(value) ? value : null;
    }
  }
  return null;
}

/** Locale para contextos que só têm o Request cru (route handlers, hooks do better-auth). */
export function localeFromRequest(request: Request): Locale {
  return (
    localeFromCookieHeader(request.headers.get("cookie")) ??
    pickLocale(request.headers.get("accept-language")) ??
    defaultLocale
  );
}
