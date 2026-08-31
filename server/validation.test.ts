import { describe, expect, it } from "vitest";
import { validateInterpretation } from "./validation";
import type { SemanticDefinition } from "../shared/governance";

describe("Semantic Interpretation Validation", () => {
  const sampleDefinitions: SemanticDefinition[] = [
    {
      id: 1,
      name: "Completed Revenue",
      kind: "metric",
      description: "Sum of completed orders",
      expression: "SUM(orders.amount)",
      aliases: ["revenue", "sales", "completed_rev"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 2,
      name: "Customer Region",
      kind: "dimension",
      description: "Region of customer",
      expression: "customers.region",
      aliases: ["region", "geo"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  it("validates metrics dynamically against available definitions", () => {
    // Approved metric name and aliases
    expect(validateInterpretation({ metric: "Completed Revenue" }, sampleDefinitions).ok).toBe(true);
    expect(validateInterpretation({ metric: "revenue" }, sampleDefinitions).ok).toBe(true);
    expect(validateInterpretation({ metric: "sales" }, sampleDefinitions).ok).toBe(true);
    expect(validateInterpretation({ metric: "Unresolved" }, sampleDefinitions).ok).toBe(true);

    // Unapproved metric with catalog provided
    const unapproved = validateInterpretation({ metric: "Unapproved Metric" }, sampleDefinitions);
    expect(unapproved.ok).toBe(false);
    expect(unapproved.valid).toBe(false);
    expect(unapproved.errors?.[0]).toMatch(/Invalid metric.*not in the governed semantic catalog/);

    // Any valid string allowed when no catalog definitions are supplied
    expect(validateInterpretation({ metric: "Any Dynamic Metric" }).ok).toBe(true);
  });

  it("rejects floating point numbers and accepts general decimal strings", () => {
    // Should reject floating point numbers
    const numResult = validateInterpretation({ value: 100.50 });
    expect(numResult.ok).toBe(false);
    expect(numResult.errors?.[0]).toMatch(/floating-point number/);

    // Should accept correctly formatted decimal strings and integers
    expect(validateInterpretation({ value: "100" }).ok).toBe(true);
    expect(validateInterpretation({ value: "100.5" }).ok).toBe(true);
    expect(validateInterpretation({ value: "100.50" }).ok).toBe(true);
    expect(validateInterpretation({ value: "100.501" }).ok).toBe(true);
    expect(validateInterpretation({ value: "-42.123456" }).ok).toBe(true);

    // Should reject non-decimal / malformed numeric strings
    const scientificResult = validateInterpretation({ value: "1e5" });
    expect(scientificResult.ok).toBe(false);
    expect(scientificResult.errors?.[0]).toMatch(/does not conform to the Decimal string pattern/);

    const hexResult = validateInterpretation({ value: "0x12" });
    expect(hexResult.ok).toBe(false);
    expect(hexResult.errors?.[0]).toMatch(/does not conform to the Decimal string pattern/);
  });
});
