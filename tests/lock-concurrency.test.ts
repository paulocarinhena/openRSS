import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = { name: string; lockedAt: Date; expiresAt: Date };
let row: Row | null;

vi.mock("@/lib/db", () => ({
  db: {
    jobLock: {
      updateMany: vi.fn(async ({ where, data }) => {
        if (!row || row.name !== where.name || row.expiresAt > where.expiresAt.lte) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      }),
      create: vi.fn(async ({ data }) => {
        if (row) throw Object.assign(new Error("unique"), { code: "P2002" });
        row = data;
        return row;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        if (!row || row.name !== where.name || row.lockedAt.getTime() !== where.lockedAt.getTime()) return { count: 0 };
        row = null;
        return { count: 1 };
      }),
    },
  },
}));

import { withLock } from "@/lib/jobs/lock";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe("job lock concurrency", () => {
  beforeEach(() => {
    row = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("allows only one holder", async () => {
    const release = deferred();
    const first = withLock("job", 1_000, async () => release.promise);
    await vi.waitFor(() => expect(row).not.toBeNull());
    expect(await withLock("job", 1_000, async () => "second")).toBeUndefined();
    release.resolve();
    await first;
    expect(row).toBeNull();
  });

  it("does not let an expired holder release its successor", async () => {
    const releaseFirst = deferred();
    const releaseSecond = deferred();
    const first = withLock("job", 1_000, async () => releaseFirst.promise);
    await vi.waitFor(() => expect(row).not.toBeNull());

    vi.setSystemTime(new Date("2026-09-14T12:00:02Z"));
    const second = withLock("job", 1_000, async () => releaseSecond.promise);
    await vi.waitFor(() => expect(row?.lockedAt.toISOString()).toBe("2026-09-14T12:00:02.000Z"));
    releaseFirst.resolve();
    await first;

    expect(await withLock("job", 1_000, async () => "third")).toBeUndefined();
    releaseSecond.resolve();
    await second;
    expect(row).toBeNull();
  });
});
