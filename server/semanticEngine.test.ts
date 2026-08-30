import { describe, expect, it } from "vitest";
import { buildSemanticQuery, validateReadOnlySql } from "./semanticEngine";

describe("semantic SQL safety", () => {
  it("accepts a governed single-statement SELECT", () => {
    const safety = validateReadOnlySql("SELECT customer_id FROM customers LIMIT 10;");
    expect(safety.status).toBe("validated");
    expect(safety.checks.every(check => check.passed)).toBe(true);
  });

  it("rejects mutating or stacked SQL", () => {
    const safety = validateReadOnlySql("SELECT * FROM customers; DELETE FROM customers;");
    expect(safety.status).toBe("rejected");
    expect(safety.checks.find(check => check.label === "Mutation scan")?.passed).toBe(false);
  });

  it("grounds a regional business question in the canonical metric", async () => {
    const run = await buildSemanticQuery("Show revenue by region", false);
    expect(run.metric).toBe("Completed Revenue");
    expect(run.dimension).toBe("Customer Region");
    expect(run.safety.status).toBe("validated");
    expect(run.sql.toLowerCase()).toContain("where o.order_status = 'completed'");
  });

  it("resolves plural customer wording to the governed customer ranking", async () => {
    const run = await buildSemanticQuery("Which customers generated the most completed revenue?", false);
    expect(run.intent).toBe("ranking");
    expect(run.dimension).toBe("Customer");
  });

  it("asks for clarification instead of drafting SQL for an underspecified request", async () => {
    const run = await buildSemanticQuery("Show performance", false);
    expect(run.ambiguity.detected).toBe(true);
    expect(run.safety.status).toBe("clarification_required");
    expect(run.sql).toBe("");
  });
});
