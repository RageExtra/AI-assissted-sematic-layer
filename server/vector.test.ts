import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./_core/vector";

describe("Vector Cosine Similarity & Safety", () => {
  it("computes cosine similarity accurately for valid vectors", () => {
    // Identical vectors -> 1.0
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);

    // Orthogonal vectors -> 0.0
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);

    // Opposite vectors -> -1.0
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it("handles dimension mismatch and empty vectors safely without NaN", () => {
    // Dimension mismatch (e.g. 384 vs 128)
    const vec384 = new Array(384).fill(0.1);
    const vec128 = new Array(128).fill(0.1);
    expect(cosineSimilarity(vec384, vec128)).toBe(0);
    expect(cosineSimilarity(vec128, vec384)).toBe(0);

    // Empty vectors
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [])).toBe(0);
    expect(cosineSimilarity([], [1, 2])).toBe(0);
  });

  it("handles zero vectors and edge cases without NaN", () => {
    // Zero norms
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);

    // Null / undefined safety
    expect(cosineSimilarity(null as any, [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], undefined as any)).toBe(0);
  });
});
