import type { locales } from "@/i18n/config";
import type messages from "../../messages/pt-BR.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof locales)[number];
    Messages: typeof messages;
  }
}
