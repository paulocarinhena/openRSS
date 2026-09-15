import { getRequestConfig } from "next-intl/server";
import { isLocale } from "./config";
import { resolveRequestLocale } from "./locale";

export default getRequestConfig(async ({ locale: explicit }) => {
  // Com locale explícito (getTranslations({locale})) não tocamos em cookies/headers,
  // o que permite usar a config fora do escopo de uma requisição.
  const locale = isLocale(explicit) ? explicit : await resolveRequestLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
