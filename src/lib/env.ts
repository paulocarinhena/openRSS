export const DATABASE_PROVIDERS = ["sqlite", "postgresql"] as const;

export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

type RuntimeEnvironment = {
  APP_SECRET?: string;
  DATABASE_PROVIDER?: string;
  DATABASE_URL?: string;
};

const APP_SECRET_PLACEHOLDERS = new Set([
  "build-only-placeholder-secret",
  "change-me",
  "changeme",
  "secret",
  "troque-este-segredo-por-um-valor-aleatorio",
]);

export function readDatabaseProvider(
  env: RuntimeEnvironment = process.env as RuntimeEnvironment,
): DatabaseProvider {
  const provider = env.DATABASE_PROVIDER?.trim() || "sqlite";
  if (!DATABASE_PROVIDERS.includes(provider as DatabaseProvider)) {
    throw new Error(
      `DATABASE_PROVIDER inválido: "${provider}". Use "sqlite" ou "postgresql".`,
    );
  }
  return provider as DatabaseProvider;
}

export function readDatabaseUrl(
  provider: DatabaseProvider,
  env: RuntimeEnvironment = process.env as RuntimeEnvironment,
) {
  const url = env.DATABASE_URL?.trim() || (provider === "sqlite" ? "file:./data/openrss.db" : "");
  if (provider === "postgresql" && !/^postgres(?:ql)?:\/\//i.test(url)) {
    throw new Error("DATABASE_URL deve ser uma URL postgresql:// quando DATABASE_PROVIDER=postgresql.");
  }
  if (provider === "sqlite" && !url.startsWith("file:")) {
    throw new Error("DATABASE_URL deve começar com file: quando DATABASE_PROVIDER=sqlite.");
  }
  return url;
}

export function readAppSecret(env: RuntimeEnvironment = process.env as RuntimeEnvironment): string {
  const secret = env.APP_SECRET?.trim();
  if (!secret) {
    throw new Error("APP_SECRET não definido. Gere um segredo aleatório com pelo menos 16 caracteres.");
  }
  if (secret.length < 16) {
    throw new Error("APP_SECRET muito curto. Use pelo menos 16 caracteres aleatórios.");
  }
  if (APP_SECRET_PLACEHOLDERS.has(secret.toLowerCase())) {
    throw new Error("APP_SECRET contém um valor de exemplo inseguro. Gere um segredo aleatório.");
  }
  return secret;
}

export function validateRuntimeEnvironment(
  env: RuntimeEnvironment = process.env as RuntimeEnvironment,
) {
  const databaseProvider = readDatabaseProvider(env);
  return {
    databaseProvider,
    databaseUrl: readDatabaseUrl(databaseProvider, env),
    appSecret: readAppSecret(env),
  };
}
