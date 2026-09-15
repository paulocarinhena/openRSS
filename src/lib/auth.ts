import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { db, getDbProvider } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { readAppSecret } from "@/lib/env";
import { lazyObject } from "@/lib/lazy";

// Lazy: o provider só é conhecido depois do assistente de instalação.
export const auth = lazyObject(() => betterAuth({
  secret: readAppSecret(),
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(db, { provider: getDbProvider() }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  hooks: {
    // Cadastro público só quando não há usuários (primeiro admin) ou quando o admin liberou.
    // Chamadas server-side (auth.api.signUpEmail, sem request) são usadas pelo admin e passam.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" || !ctx.request) return;
      const users = await db.user.count();
      if (users === 0) return;
      const settings = await getAppSettings();
      if (!settings.allowRegistration) {
        throw new APIError("FORBIDDEN", { message: "Cadastro desativado pelo administrador." });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // Usuários criados pelo admin recebem o papel solicitado logo após o cadastro.
          if (!ctx?.request) return { data: { ...user, role: "user" } };

          const settings = await getAppSettings();
          const users = await db.user.count();
          if (users > 0) {
            if (!settings.allowRegistration) {
              throw new APIError("FORBIDDEN", { message: "Cadastro desativado pelo administrador." });
            }
            return { data: { ...user, role: "user" } };
          }

          const claimed = await db.$executeRaw`
            UPDATE "app_settings"
            SET "bootstrapAdminEmail" = ${user.email}
            WHERE "id" = 'app'
              AND ("bootstrapAdminEmail" IS NULL OR "bootstrapAdminEmail" = ${user.email})
          `;
          if (claimed > 0) return { data: { ...user, role: "admin" } };
          if (settings.allowRegistration) return { data: { ...user, role: "user" } };
          throw new APIError("FORBIDDEN", { message: "O administrador inicial já está sendo criado." });
        },
      },
    },
  },
  plugins: [nextCookies()],
}));

export type AuthSession = typeof auth.$Infer.Session;
