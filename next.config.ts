import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Módulos nativos / com binários ficam fora do bundle do servidor.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "pg"],
  poweredByHeader: false,
};

// Registra src/i18n/request.ts como configuração de locale/mensagens por requisição.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
