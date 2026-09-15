import { describe, expect, it } from "vitest";
import { digestTimeReached } from "@/lib/ai/digest";
import { dayRangeInTimezone } from "@/lib/queries";

describe("persistent daily jobs and scopes", () => {
  it("uses the user's local calendar day for Hoje", () => {
    const range = dayRangeInTimezone(new Date("2026-09-14T02:30:00Z"), "America/Sao_Paulo");
    expect(range.start.toISOString()).toBe("2026-09-13T03:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-14T03:00:00.000Z");
  });

  it("handles a daylight-saving day without assuming 24 hours", () => {
    const range = dayRangeInTimezone(new Date("2026-03-08T16:00:00Z"), "America/New_York");
    expect(range.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("keeps a missed digest due during the rest of the same day", () => {
    const late = new Date("2026-09-14T15:00:00Z");
    expect(digestTimeReached(late, "America/Sao_Paulo", 7)).toBe(true);
    expect(digestTimeReached(late, "America/Sao_Paulo", 13)).toBe(false);
  });
});
