// Este módulo é copiado sozinho para a imagem Docker e usado pelo prisma.config.ts:
// só pode depender de módulos nativos do Node.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DATABASE_PROVIDERS = ["sqlite", "postgresql"] as const;

export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

export type DatabaseConfig = { provider: DatabaseProvider; url: string };

/** Conteúdo de `<dataDir>/config.json`, gravado pelo assistente de primeira execução. */
export type StoredConfig = {
  version: 1;
  appSecret?: string;
  database?: { provider: "sqlite" } | { provider: "postgresql"; url: string };
};

type RuntimeEnvironment = {
  APP_SECRET?: string;
  DATABASE_PROVIDER?: string;
  DATABASE_URL?: string;
  OPENRSS_DATA_DIR?: string;
};

const APP_SECRET_PLACEHOLDERS = new Set([
  "build-only-placeholder-secret",
  "change-me",
  "changeme",
  "secret",
  "troque-este-segredo-por-um-valor-aleatorio",
]);

export class SetupRequiredError extends Error {
  constructor() {
    super("Banco de dados ainda não configurado. Acesse /setup para concluir a instalação.");
    this.name = "SetupRequiredError";
  }
}

const processEnv = () => process.env as RuntimeEnvironment;

export function readDataDir(env: RuntimeEnvironment = processEnv()) {
  return env.OPENRSS_DATA_DIR?.trim() || "./data";
}

export function configFilePath(dataDir: string) {
  return join(dataDir, "config.json");
}

/** URL do SQLite derivada da pasta de dados (não é gravada no config.json). */
export function sqliteUrl(dataDir: string) {
  return `file:${dataDir.replace(/\\/g, "/").replace(/\/$/, "")}/openrss.db`;
}

// ── config.json ──────────────────────────────────────

// Memoizado pelo mtime do arquivo: o proxy roda em um bundle próprio (cache separado)
// e precisa enxergar o config.json assim que o assistente o gravar.
const configCache = new Map<string, { mtimeMs: number; config: StoredConfig }>();

export function resetConfigCache() {
  configCache.clear();
}

export function loadStoredConfig(dataDir: string): StoredConfig | null {
  const file = configFilePath(dataDir);
  if (!existsSync(file)) return null;

  const { mtimeMs } = statSync(file);
  const cached = configCache.get(dataDir);
  if (cached?.mtimeMs === mtimeMs) return cached.config;

  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StoredConfig>;
  if (parsed.database && !DATABASE_PROVIDERS.includes(parsed.database.provider)) {
    throw new Error(`${file}: provider inválido "${parsed.database.provider}".`);
  }
  const config: StoredConfig = { version: 1, appSecret: parsed.appSecret, database: parsed.database };
  configCache.set(dataDir, { mtimeMs, config });
  return config;
}

/** Grava o config.json de forma atômica e só legível pelo dono (contém segredos). */
export function writeStoredConfig(dataDir: string, config: StoredConfig) {
  mkdirSync(dataDir, { recursive: true });
  const file = configFilePath(dataDir);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // Sistemas de arquivos sem permissões POSIX (ex.: Windows).
  }
  configCache.delete(dataDir);
}

// ── Banco ────────────────────────────────────────────

export function readDatabaseUrl(provider: DatabaseProvider, env: RuntimeEnvironment = processEnv()) {
  const url = env.DATABASE_URL?.trim() || (provider === "sqlite" ? sqliteUrl(readDataDir(env)) : "");
  if (provider === "postgresql" && !/^postgres(?:ql)?:\/\//i.test(url)) {
    throw new Error("DATABASE_URL deve ser uma URL postgresql:// quando DATABASE_PROVIDER=postgresql.");
  }
  if (provider === "sqlite" && !url.startsWith("file:")) {
    throw new Error("DATABASE_URL deve começar com file: quando DATABASE_PROVIDER=sqlite.");
  }
  return url;
}

function parseProvider(provider: string): DatabaseProvider {
  if (!DATABASE_PROVIDERS.includes(provider as DatabaseProvider)) {
    throw new Error(`DATABASE_PROVIDER inválido: "${provider}". Use "sqlite" ou "postgresql".`);
  }
  return provider as DatabaseProvider;
}

/**
 * Precedência: variáveis de ambiente explícitas > config.json > null (assistente pendente).
 * `stored` pode ser injetado em testes; por padrão lê `<dataDir>/config.json`.
 */
export function resolveDatabaseConfig(
  env: RuntimeEnvironment = processEnv(),
  stored: StoredConfig | null = loadStoredConfig(readDataDir(env)),
): (DatabaseConfig & { source: "env" | "file" }) | null {
  const envProvider = env.DATABASE_PROVIDER?.trim();
  const envUrl = env.DATABASE_URL?.trim();
  if (envProvider || envUrl) {
    const inferred = envUrl && /^postgres(?:ql)?:\/\//i.test(envUrl) ? "postgresql" : "sqlite";
    const provider = parseProvider(envProvider || inferred);
    return { provider, url: readDatabaseUrl(provider, env), source: "env" };
  }

  const db = stored?.database;
  if (!db) return null;
  if (db.provider === "postgresql") {
    return { provider: "postgresql", url: readDatabaseUrl("postgresql", { DATABASE_URL: db.url }), source: "file" };
  }
  return { provider: "sqlite", url: sqliteUrl(readDataDir(env)), source: "file" };
}

export function isSetupRequired(env: RuntimeEnvironment = processEnv()) {
  return resolveDatabaseConfig(env) === null;
}

export function readDatabaseProvider(env: RuntimeEnvironment = processEnv()): DatabaseProvider {
  const config = resolveDatabaseConfig(env);
  if (!config) throw new SetupRequiredError();
  return config.provider;
}

// ── Segredo ──────────────────────────────────────────

function validateAppSecret(secret: string, origin: string) {
  if (secret.length < 16) {
    throw new Error(`${origin} muito curto. Use pelo menos 16 caracteres aleatórios.`);
  }
  if (APP_SECRET_PLACEHOLDERS.has(secret.toLowerCase())) {
    throw new Error(`${origin} contém um valor de exemplo inseguro. Gere um segredo aleatório.`);
  }
  return secret;
}

/**
 * APP_SECRET do ambiente > config.json > gerado agora e persistido no config.json.
 * Protege sessões e criptografa chaves de IA — não pode mudar depois do primeiro uso.
 */
export function readAppSecret(
  env: RuntimeEnvironment = processEnv(),
  stored: StoredConfig | null | undefined = undefined,
): string {
  const fromEnv = env.APP_SECRET?.trim();
  if (fromEnv) return validateAppSecret(fromEnv, "APP_SECRET");

  const dataDir = readDataDir(env);
  const config = stored === undefined ? loadStoredConfig(dataDir) : stored;
  const fromFile = config?.appSecret?.trim();
  if (fromFile) return validateAppSecret(fromFile, "appSecret em config.json");

  const generated = randomBytes(32).toString("base64url");
  writeStoredConfig(dataDir, { version: 1, ...config, appSecret: generated });
  console.log(`openRSS: APP_SECRET gerado e salvo em ${configFilePath(dataDir)}.`);
  return generated;
}

/**
 * Token exigido pelo assistente de instalação, derivado do segredo e exibido no log ao iniciar.
 * Impede que qualquer um que alcance a instância antes do dono escolha o banco de dados.
 */
export function setupToken(env: RuntimeEnvironment = processEnv()) {
  const digest = createHmac("sha256", readAppSecret(env)).update("openrss:setup-token").digest("hex").slice(0, 16);
  return digest.match(/.{4}/g)!.join("-");
}

export function isValidSetupToken(input: unknown, env: RuntimeEnvironment = processEnv()) {
  if (typeof input !== "string") return false;
  const given = Buffer.from(input.trim().toLowerCase());
  const expected = Buffer.from(setupToken(env));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function resolveRuntimeConfig(env: RuntimeEnvironment = processEnv()) {
  return {
    database: resolveDatabaseConfig(env),
    appSecret: readAppSecret(env),
  };
}
