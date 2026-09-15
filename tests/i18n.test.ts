import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import ptBR from "../messages/pt-BR.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { isLocale, localeFromCookieHeader, localeFromRequest, locales, pickLocale } from "@/i18n/config";
import { staticTranslator } from "@/i18n/static";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const messages = { "pt-BR": ptBR, en, es } as const;

describe("dicionários de mensagens", () => {
  const reference = flatten(ptBR);

  it.each(["en", "es"] as const)("%s tem exatamente as mesmas chaves que pt-BR", (locale) => {
    const keys = flatten(messages[locale]);
    expect([...keys.keys()].sort()).toEqual([...reference.keys()].sort());
  });

  it.each(locales)("%s não tem mensagens vazias", (locale) => {
    for (const [key, value] of flatten(messages[locale])) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it.each(locales)("%s compila plurais e interpolações", (locale) => {
    const t = createTranslator({ locale, messages: messages[locale] });
    expect(t("chat.deleted", { count: 1 })).toMatch(/1/);
    expect(t("chat.deleted", { count: 5 })).toMatch(/5/);
    expect(t("articles.markedRead", { count: 2 })).toMatch(/2/);
    expect(t("shell.feedMoved", { feed: "A", folder: "B" })).toContain("A");
    expect(t("setup.errors.databaseMissing", { database: "db1" })).toContain("db1");
    expect(t.has("chat.suggestions.general.one")).toBe(true);
  });
});

describe("detecção de locale", () => {
  it("escolhe pelo Accept-Language respeitando pesos", () => {
    expect(pickLocale("en-US,en;q=0.9,pt;q=0.8")).toBe("en");
    expect(pickLocale("pt-PT")).toBe("pt-BR");
    expect(pickLocale("es-MX,es;q=0.8")).toBe("es");
    expect(pickLocale("pt;q=0.5,es;q=0.9")).toBe("es");
    expect(pickLocale("fr,de")).toBeNull();
    expect(pickLocale("")).toBeNull();
    expect(pickLocale(null)).toBeNull();
    expect(pickLocale("*")).toBeNull();
  });

  it("isLocale só aceita as tags exatas", () => {
    expect(isLocale("pt-BR")).toBe(true);
    expect(isLocale("PT-BR")).toBe(false);
    expect(isLocale("en-US")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("lê o cookie cru e cai no Accept-Language", () => {
    expect(localeFromCookieHeader("a=1; locale=es; b=2")).toBe("es");
    expect(localeFromCookieHeader("locale=xx")).toBeNull();
    const request = new Request("http://localhost", { headers: { "accept-language": "en" } });
    expect(localeFromRequest(request)).toBe("en");
    const withCookie = new Request("http://localhost", { headers: { cookie: "locale=es", "accept-language": "en" } });
    expect(localeFromRequest(withCookie)).toBe("es");
    expect(localeFromRequest(new Request("http://localhost"))).toBe("pt-BR");
  });

  it("staticTranslator cai no padrão para locales desconhecidos", () => {
    expect(staticTranslator("xx", "digest")("empty")).toBe(ptBR.digest.empty);
    expect(staticTranslator("en", "digest")("empty")).toBe(en.digest.empty);
  });
});
