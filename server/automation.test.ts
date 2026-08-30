import { describe, expect, it } from "vitest";
import { collectRegressionAlerts, executeBenchmarkSchedule, stageBenchmarkSchedule } from "./automation";
import { listEvaluationDatasets } from "./governance";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

function adminContext(): TrpcContext {
  return { user: { id: 900, openId: "automation-admin", name: "Automation admin", email: "automation@example.com", loginMethod: "manus", role: "admin", stewardRole: "approver", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("governance automation", () => {
  it("stages a disabled schedule against an existing benchmark and rejects invalid cron", async () => {
    const dataset = (await listEvaluationDatasets())[0]!;
    const schedule = await stageBenchmarkSchedule({ name: "Daily evaluation", datasetId: dataset.id, cron: "0 0 9 * * *", baselineMode: "direct_sql", retrievalDepth: 6 });
    expect(schedule.enabled).toBe(false);
    expect(schedule.datasetId).toBe(dataset.id);
    await expect(stageBenchmarkSchedule({ name: "Broken schedule", datasetId: dataset.id, cron: "every day", baselineMode: "direct_sql", retrievalDepth: 6 })).rejects.toThrow("six-field UTC cron");
  });

  it("creates alert records only for observed safety or grounding regressions", () => {
    const alerts = collectRegressionAlerts({ id: 1, safetyThreshold: 0.95, groundingThreshold: 0.9, enabled: true, updatedAt: new Date().toISOString() }, 17, 3, { safetyRate: 0.8, groundingRate: 0.89 });
    expect(alerts).toEqual([{ scheduleId: 3, evaluationRunId: 17, metric: "safety", observedValue: 0.8, thresholdValue: 0.95 }, { scheduleId: 3, evaluationRunId: 17, metric: "grounding", observedValue: 0.89, thresholdValue: 0.9 }]);
    expect(collectRegressionAlerts({ id: 1, safetyThreshold: 0.95, groundingThreshold: 0.9, enabled: false, updatedAt: new Date().toISOString() }, 17, 3, { safetyRate: 0.2, groundingRate: 0.2 })).toEqual([]);
  });

  it("executes an enabled schedule, updates its receipt timestamp, and links the generated run to the schedule", async () => {
    const dataset = (await listEvaluationDatasets())[0]!;
    const staged = await stageBenchmarkSchedule({ name: "Execution receipt benchmark", datasetId: dataset.id, cron: "0 0 10 * * *", baselineMode: "schema_prompt", retrievalDepth: 5 });
    await db.activateBenchmarkSchedule(staged.id, `test-task-${staged.id}`);
    const enabled = (await db.getBenchmarkSchedule(staged.id))!;
    await db.updateAlertPolicy({ safetyThreshold: 1.01, groundingThreshold: 1.01, enabled: true });
    const result = await executeBenchmarkSchedule(enabled, { notify: false });
    expect("run" in result).toBe(true);
    if (!("run" in result)) throw new Error("Expected schedule execution run");
    expect(result.run.scheduleId).toBe(staged.id);
    const updated = (await db.getBenchmarkSchedule(staged.id))!;
    expect(updated.lastRunAt).not.toBeNull();
    expect((await db.listEvaluationRunsForSchedule(staged.id))[0]?.id).toBe(result.run.id);
    const alerts = (await db.listRegressionAlerts()).filter(alert => alert.evaluationRunId === result.run.id);
    expect(alerts.map(alert => alert.metric).sort()).toEqual(["grounding", "safety"]);
    await db.updateAlertPolicy({ safetyThreshold: 0.95, groundingThreshold: 0.9, enabled: true });
  }, 35000);

  it("lets administrators assign steward roles through the server guard", async () => {
    await db.upsertUser({ openId: "automation-role-test", name: "Role test", email: "role-test@example.com", stewardRole: "viewer", role: "user" });
    const target = (await db.getUserByOpenId("automation-role-test"))!;
    const caller = appRouter.createCaller(adminContext());
    const updated = await caller.governance.assignStewardRole({ userId: target.id, stewardRole: "approver" });
    expect(updated.stewardRole).toBe("approver");
  });
});
