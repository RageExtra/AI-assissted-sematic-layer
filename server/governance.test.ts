import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type StewardRole = "viewer" | "editor" | "approver";

const context = (stewardRole: StewardRole): TrpcContext => ({
  user: { id: 1, openId: `steward-${stewardRole}`, name: `${stewardRole} steward`, email: `${stewardRole}@example.com`, loginMethod: "manus", role: "user", stewardRole, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: () => undefined } as TrpcContext["res"],
});

describe("governance workflows", () => {
  it("keeps viewers read-only at the server boundary", async () => {
    const caller = appRouter.createCaller(context("viewer"));
    const definitions = await caller.governance.definitions();
    await expect(caller.governance.updateDefinition({ id: definitions[0]!.id, description: definitions[0]!.description, expression: definitions[0]!.expression, aliases: definitions[0]!.aliases, rationale: "A viewer must not be able to submit this change." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows editors to stage a source and propose, but not approve, a definition", async () => {
    const caller = appRouter.createCaller(context("editor"));
    const source = await caller.governance.stageSource({ name: "Finance read replica", provider: "postgresql", host: "finance.internal", databaseName: "finance", authMode: "environment_uri", secretEnvKey: "FINANCE_WAREHOUSE_URL" });
    expect(source.connectionState).toBe("awaiting_credentials");
    const definitions = await caller.governance.definitions();
    const changed = await caller.governance.updateDefinition({ id: definitions[0]!.id, description: definitions[0]!.description, expression: definitions[0]!.expression, aliases: definitions[0]!.aliases, rationale: "Clarified evidence wording for steward review." });
    expect(changed.status).toBe("pending_review");
    await expect(caller.governance.approveDefinition({ id: changed.id, rationale: "Only an approver can sign this contract." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows approvers to sign definitions and run a reproducible evaluation", async () => {
    const caller = appRouter.createCaller(context("approver"));
    const definitions = await caller.governance.definitions();
    const approved = await caller.governance.approveDefinition({ id: definitions[0]!.id, rationale: "Approved after evidence and lineage review." });
    expect(approved.status).toBe("approved");
    const dataset = (await caller.governance.datasets())[0]!;
    const run = await caller.governance.runEvaluation({ datasetId: dataset.id, modelLabel: "Grounded compiler v1", retrievalDepth: 6, baselineMode: "direct_sql" });
    expect(run.semanticScore).toBeGreaterThan(run.baselineScore);
    expect(run.safetyRate).toBe(1);
    const trend = await caller.governance.evaluationTrends();
    expect(trend.at(-1)).toMatchObject({ id: run.id, semanticScore: run.semanticScore, groundingRate: run.groundingRate, safetyRate: run.safetyRate, reproducibilityRate: run.reproducibilityRate });
    expect(trend.every((item, index) => index === 0 || new Date(item.createdAt).getTime() >= new Date(trend[index - 1]!.createdAt).getTime())).toBe(true);
  }, 30000);

  it("allows editors to import validated CSV benchmarks and exposes them to the trend registry", async () => {
    const caller = appRouter.createCaller(context("editor"));
    const imported = await caller.governance.importDataset({ name: "Imported commerce benchmark", description: "A CSV-based benchmark used to validate the import path.", scope: "Commerce warehouse", version: "v1.0", format: "csv", content: "question,expectedIntent,requiredMetric,requiredDimension,baselinePass\nShow revenue by region,aggregation,Completed Revenue,Customer Region,false" });
    expect(imported.importedCases).toBe(1);
    expect(imported.dataset.tags).toContain("imported");
    const trend = await caller.governance.evaluationTrends();
    expect(Array.isArray(trend)).toBe(true);
  });
});
