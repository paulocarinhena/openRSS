/** Id do provedor no Better Auth: callback em <BETTER_AUTH_URL>/api/auth/callback/oidc. */
export const OIDC_PROVIDER_ID = "oidc";

export type OidcConfig = {
  discoveryUrl: string;
  clientId: string;
  clientSecret: string | undefined;
  name: string;
  scopes: string[];
  /** Cria conta para quem o provedor autenticar (o IdP decide quem entra). Senão, vale o "cadastro aberto" da instância. */
  autoRegister: boolean;
  /** Esconde e desativa o login por email e senha. */
  passwordLoginDisabled: boolean;
};

type Env = Record<string, string | undefined>;

const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value.trim() === "" ? fallback : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());

/** Lê OIDC_* do ambiente; null quando o SSO não está configurado. */
export function readOidcConfig(env: Env = process.env): OidcConfig | null {
  const issuer = env.OIDC_ISSUER?.trim().replace(/\/$/, "");
  const discoveryUrl = env.OIDC_DISCOVERY_URL?.trim() || (issuer ? `${issuer}/.well-known/openid-configuration` : "");
  const clientId = env.OIDC_CLIENT_ID?.trim();
  if (!discoveryUrl || !clientId) return null;
  return {
    discoveryUrl,
    clientId,
    clientSecret: env.OIDC_CLIENT_SECRET?.trim() || undefined,
    name: env.OIDC_PROVIDER_NAME?.trim() || "SSO",
    scopes: (env.OIDC_SCOPES?.trim() || "openid email profile").split(/[\s,]+/).filter(Boolean),
    autoRegister: flag(env.OIDC_AUTO_REGISTER, true),
    passwordLoginDisabled: flag(env.OIDC_DISABLE_PASSWORD_LOGIN, false),
  };
}

/** O que as páginas públicas (login) precisam saber, sem segredos. */
export function publicOidcInfo(env: Env = process.env) {
  const config = readOidcConfig(env);
  return config ? { name: config.name, passwordLoginDisabled: config.passwordLoginDisabled } : null;
}
