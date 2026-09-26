import { describe, expect, it } from "vitest";
import { bytesToVector, dot, toVector, vectorToBytes } from "@/lib/ai/embeddings";

describe("embedding vectors", () => {
  it("normalizes so the dot product is the cosine similarity", () => {
    const a = toVector([3, 4]);
    expect(dot(a, a)).toBeCloseTo(1);
    expect(dot(toVector([1, 0]), toVector([0, 5]))).toBeCloseTo(0);
    expect(dot(toVector([1, 1]), toVector([2, 2]))).toBeCloseTo(1);
  });

  it("round-trips through bytes and ignores vectors of another size", () => {
    const v = toVector([0.1, 0.2, 0.3]);
    expect(Array.from(bytesToVector(vectorToBytes(v)))).toEqual(Array.from(v));
    expect(dot(v, toVector([1, 2]))).toBe(0);
  });
});
