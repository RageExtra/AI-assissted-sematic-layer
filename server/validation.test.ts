import { describe, expect, it } from "vitest";
import { validateInterpretation } from "./validation";

describe("Semantic Interpretation Validation", () => {
  it("allows exact Completed Revenue metric and rejects others", () => {
    expect(validateInterpretation({ metric: "Completed Revenue" }).ok).toBe(true);
    expect(validateInterpretation({ metric: "Unresolved" }).ok).toBe(true);
    const result = validateInterpretation({ metric: "Gross Revenue" });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toMatch(/Invalid metric/);
  });

  it("rejects floating point numbers and requires decimal strings", () => {
    // Should reject floating point numbers
    const numResult = validateInterpretation({ value: 100.50 });
    expect(numResult.ok).toBe(false);
    expect(numResult.errors?.[0]).toMatch(/floating-point number/);

    // Should accept correctly formatted decimal strings
    expect(validateInterpretation({ value: "100.50" }).ok).toBe(true);
    expect(validateInterpretation({ value: "100" }).ok).toBe(true);

    // Should reject incorrectly formatted decimal strings
    const strResult = validateInterpretation({ value: "100.501" });
    expect(strResult.ok).toBe(false);
    expect(strResult.errors?.[0]).toMatch(/does not conform to the exact Decimal/);
  });
});
