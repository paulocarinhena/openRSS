import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Módulos nativos / com binários ficam fora do bundle do servidor.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
