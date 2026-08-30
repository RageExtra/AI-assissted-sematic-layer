import { describe, expect, it } from "vitest";
import { parseEvaluationImport, previewEvaluationImport } from "./governance";

describe("evaluation dataset imports", () => {
  it("parses CSV cases using documented headers", () => {
    const cases = parseEvaluationImport("csv", "question,expectedIntent,requiredMetric,requiredDimension,baselinePass\nShow revenue by region,aggregation,Completed Revenue,Customer Region,false");
    expect(cases).toEqual([{ question: "Show revenue by region", expectedIntent: "aggregation", requiredMetric: "Completed Revenue", requiredDimension: "Customer Region", baselinePass: false }]);
  });

  it("accepts JSON case arrays and rejects incomplete records", () => {
    const cases = parseEvaluationImport("json", JSON.stringify([{ question: "Show performance", expectedIntent: "clarification", requiredMetric: "Unresolved", requiredDimension: "Unresolved", baselinePass: false }]));
    expect(cases).toHaveLength(1);
    expect(() => parseEvaluationImport("json", "[{\"question\":\"missing assertions\"}]")).toThrow("Case 1 must include");
  });

  it("returns parsed preview rows only after all required fields validate", () => {
    const preview = previewEvaluationImport("csv", "question,expectedIntent,requiredMetric,requiredDimension,baselinePass\nShow revenue by region,aggregation,Completed Revenue,Customer Region,false");
    expect(preview).toMatchObject({ valid: true, caseCount: 1 });
    expect(preview.preview[0]?.requiredDimension).toBe("Customer Region");
  });
});
