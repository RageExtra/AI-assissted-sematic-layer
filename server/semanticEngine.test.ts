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
    expect(run.metric).toBe("Unresolved");
    expect(run.dimension).toBe("Unresolved");
    expect(run.ambiguity.questions.length).toBeGreaterThan(0);
  });

  it("handles demo query execution error gracefully with self-correction fallback", async () => {
    const run = await buildSemanticQuery("Show revenue by region", false, true);
    expect(run.result).toBeDefined();
    expect(run.result.columns).toContain("Region");
    expect(run.result.rows.length).toBeGreaterThan(0);
    expect(run.safety.status).toBe("validated");
  });

  it("retrieves relevant definitions dynamically by alias and short acronyms", async () => {
    const { createDefinition, getRelevantDefinitions } = await import("./db");
    
    // Seed definitions with aliases and short acronyms
    await createDefinition({
      kind: "metric",
      name: "Gross Merchandise Value",
      description: "Total sales monetary value of merchandise sold",
      expression: "SUM(orders.total_price)",
      aliases: ["gmv", "gross merchandise volume"],
      evidence: [],
      status: "approved",
      version: 1,
      rationale: "Core ecommerce metric",
    });

    await createDefinition({
      kind: "metric",
      name: "Customer Acquisition Cost",
      description: "Cost to acquire a new customer",
      expression: "marketing_spend / new_customers",
      aliases: ["cac"],
      evidence: [],
      status: "approved",
      version: 1,
      rationale: "Unit economics metric",
    });

    // Query using 3-letter acronym
    const gmvDefs = await getRelevantDefinitions("What was our GMV this month?");
    expect(gmvDefs.some(d => d.name === "Gross Merchandise Value")).toBe(true);

    const cacDefs = await getRelevantDefinitions("Show CAC by channel");
    expect(cacDefs.some(d => d.name === "Customer Acquisition Cost")).toBe(true);
  });
});
