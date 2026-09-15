import "server-only";
import { db } from "@/lib/db";

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** Executa fn se conseguir o lock (TTL em ms). Retorna undefined se já estava em execução. */
export async function acquireLock(name: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
  const now = new Date();
  const owner = now;
  const expiresAt = new Date(now.getTime() + ttlMs);
  let acquired = (await db.jobLock.updateMany({
    where: { name, expiresAt: { lte: now } },
    data: { lockedAt: owner, expiresAt },
  })).count === 1;

  if (!acquired) {
    try {
      await db.jobLock.create({ data: { name, lockedAt: owner, expiresAt } });
      acquired = true;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  if (!acquired) return null;
  return async () => {
    // O dono antigo nunca libera uma aquisição que ocorreu depois do vencimento do seu TTL.
    await db.jobLock.deleteMany({ where: { name, lockedAt: owner } }).catch(() => {});
  };
}

export async function withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
  const release = await acquireLock(name, ttlMs);
  if (!release) return undefined;
  try {
    return await fn();
  } finally {
    await release();
  }
}
