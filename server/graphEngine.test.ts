import { describe, it, expect } from "vitest";
import { getKnowledgeGraphStatus, getGraphContextForQuery } from "./graphEngine";

describe("Neo4j Knowledge Graph Engine", () => {
  it("provides knowledge graph status with fallback ontology when unconfigured", async () => {
    const status = await getKnowledgeGraphStatus();
    expect(status).toBeDefined();
    expect(status.nodes).toBeGreaterThan(0);
    expect(status.relationships).toBeGreaterThan(0);
  });

  it("dynamically resolves entity relationships for customer revenue queries", async () => {
    const context = await getGraphContextForQuery("Which customer generated the most completed revenue?");
    expect(context.paths.length).toBeGreaterThan(0);
    expect(context.relationships.length).toBeGreaterThan(0);
    expect(context.entities).toContain("Customer");
    expect(context.entities).toContain("Completed Revenue");
    expect(context.groundingItems.some(item => item.label.includes("Customer") && item.label.includes("Order"))).toBe(true);
  });

  it("resolves territory/geography queries to Customer Region dimension", async () => {
    const context = await getGraphContextForQuery("Show sales across different regions");
    expect(context.entities).toContain("Customer Region");
    expect(context.relationships.some(r => r.includes("CLASSIFIED_BY") || r.includes("MAPS_TO"))).toBe(true);
  });
});
