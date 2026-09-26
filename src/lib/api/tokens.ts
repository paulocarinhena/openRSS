import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const md5 = (value: string) => createHash("md5").update(value).digest("hex");

/** A api_key da Fever é md5("email:senha"), calculada pelo cliente. */
export const feverApiKey = (email: string, password: string) => md5(`${email.trim().toLowerCase()}:${password}`);

/** Cria uma senha de aplicativo. O texto só existe nesta resposta: o banco guarda apenas hashes. */
export async function createAppPassword(user: { id: string; email: string }, name: string) {
  const password = `ors_${randomBytes(24).toString("base64url")}`;
  const token = await db.apiToken.create({
    data: {
      userId: user.id,
      name,
      secretHash: sha256(password),
      feverKeyHash: sha256(feverApiKey(user.email, password)),
    },
    select: { id: true, name: true, createdAt: true },
  });
  return { ...token, password };
}

export type ApiUser = { id: string; email: string; name: string; tokenId: string };

async function resolve(where: { secretHash: string } | { feverKeyHash: string }): Promise<ApiUser | null> {
  const token = await db.apiToken.findUnique({ where, include: { user: { select: { id: true, email: true, name: true } } } });
  if (!token) return null;
  // Registra o uso com folga de 5 min, para não escrever a cada requisição.
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 5 * 60_000) {
    await db.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { ...token.user, tokenId: token.id };
}

/** Senha de aplicativo (Google Reader: ClientLogin e cabeçalho GoogleLogin auth=). */
export function userFromAppPassword(password: string | null | undefined) {
  return password ? resolve({ secretHash: sha256(password) }) : Promise.resolve(null);
}

/** api_key da Fever. */
export function userFromFeverKey(apiKey: string | null | undefined) {
  return apiKey && /^[0-9a-f]{32}$/i.test(apiKey) ? resolve({ feverKeyHash: sha256(apiKey.toLowerCase()) }) : Promise.resolve(null);
}
