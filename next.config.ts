import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isDev = process.env.NODE_ENV === "development";

// Segunda barreira para o HTML de terceiros exibido no leitor (já saneado no servidor).
// Imagens e mídia dos feeds vêm de qualquer origem; scripts, frames e formulários, não.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' http: https: data: blob:",
  "media-src 'self' http: https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // "same-origin" e não "no-referrer": com no-referrer o navegador envia Origin: null em POSTs,
  // e as server actions rejeitam a requisição. Assim a URL da instância não vaza para sites externos.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // Módulos nativos / com binários ficam fora do bundle do servidor.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "pg"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // O navegador precisa sempre da versão atual do service worker.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

// Registra src/i18n/request.ts como configuração de locale/mensagens por requisição.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
