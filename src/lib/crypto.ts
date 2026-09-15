import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readAppSecret } from "@/lib/env";

function key(): Buffer {
  const secret = readAppSecret();
  return createHash("sha256").update(`openrss:ai-keys:${secret}`).digest();
}

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Payload criptografado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function maskKey(plain: string): string {
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 3)}••••${plain.slice(-4)}`;
}
