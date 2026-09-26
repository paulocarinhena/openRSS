import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { db, getDbProvider } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { readAppSecret } from "@/lib/env";
import { lazyObject } from "@/lib/lazy";
import { localeFromRequest } from "@/i18n/config";
import { staticTranslator } from "@/i18n/static";
import { OIDC_PROVIDER_ID, readOidcConfig } from "@/lib/oidc";
import { buttonHtml, emailLayout, escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";

/** Erro de cadastro com código estável (o formulário traduz pelo código) e mensagem no idioma do request. */
function registrationError(code: "REGISTRATION_DISABLED" | "ADMIN_BOOTSTRAP_IN_PROGRESS", request: Request | undefined) {
  const t = staticTranslator(request ? localeFromRequest(request) : "pt-BR", "auth.errors");
  return new APIError("FORBIDDEN", { code, message: t(code) });
}

/** Usuário vindo do callback OIDC (e não do formulário de cadastro)? */
const isOidcCallback = (path: string | undefined) => path?.startsWith("/callback/") ?? false;

// Lazy: o provider só é conhecido depois do assistente de instalação.
export const auth = lazyObject(() => {
  const oidc = readOidcConfig();
  return betterAuth({
    secret: readAppSecret(),
    baseURL: process.env.BETTER_AUTH_URL,
    database: prismaAdapter(db, { provider: getDbProvider() }),
    emailAndPassword: {
      // Com OIDC_DISABLE_PASSWORD_LOGIN, só o SSO entra (as senhas de aplicativo das APIs continuam valendo).
      enabled: !oidc?.passwordLoginDisabled,
      minPasswordLength: 8,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      // Só existe com SMTP configurado; a resposta ao pedido é a mesma exista ou não o e-mail.
      sendResetPassword: async ({ user, url }, request) => {
        if (!isMailConfigured()) return;
        const t = staticTranslator(request ? localeFromRequest(request) : "pt-BR", "mail.reset");
        await sendMail({
          to: user.email,
          subject: t("subject"),
          text: `${t("intro", { name: user.name })}\n\n${url}\n\n${t("ignore")}`,
          html: emailLayout({
            title: t("subject"),
            bodyHtml: `<p>${escapeHtml(t("intro", { name: user.name }))}</p>${buttonHtml(t("button"), url)}<p style="color:#64748b;font-size:13px">${escapeHtml(t("ignore"))}</p>`,
          }),
        });
      },
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
        if (!settings.allowRegistration) throw registrationError("REGISTRATION_DISABLED", ctx.request);
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
              const viaSso = isOidcCallback(ctx.path) && oidc?.autoRegister;
              if (!settings.allowRegistration && !viaSso) throw registrationError("REGISTRATION_DISABLED", ctx.request);
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
            throw registrationError("ADMIN_BOOTSTRAP_IN_PROGRESS", ctx.request);
          },
        },
      },
    },
    plugins: [
      ...(oidc
        ? [
            genericOAuth({
              config: [
                {
                  providerId: OIDC_PROVIDER_ID,
                  name: oidc.name,
                  discoveryUrl: oidc.discoveryUrl,
                  clientId: oidc.clientId,
                  clientSecret: oidc.clientSecret,
                  scopes: oidc.scopes,
                  // Só aceita o provedor se a descoberta trouxer issuer e JWKS para validar o id_token.
                  requireIdTokenVerification: true,
                },
              ],
            }),
          ]
        : []),
      nextCookies(),
    ],
  });
});

export type AuthSession = typeof auth.$Infer.Session;
