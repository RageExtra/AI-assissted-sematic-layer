import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { createHeartbeatJob } from "./_core/heartbeat";
import { notifyOwner } from "./_core/notification";
import type { AlertPolicy, BenchmarkSchedule } from "../shared/governance";
import * as db from "./db";
import { listEvaluationDatasets, runEvaluation } from "./governance";

type ScheduleInput = { name: string; datasetId: number; cron: string; baselineMode: "direct_sql" | "schema_prompt"; retrievalDepth: number };
const cronPattern = /^\d+\s+\d+\s+\d+\s+(\*|\d+)\s+(\*|\d+)\s+(\*|\d+)$/;

export async function stageBenchmarkSchedule(input: ScheduleInput) {
  if (!cronPattern.test(input.cron)) throw new Error("Use a six-field UTC cron expression, for example: 0 0 9 * * *.");
  const dataset = (await listEvaluationDatasets()).find(item => item.id === input.datasetId);
  if (!dataset) throw new Error("Evaluation dataset was not found.");
  return db.createBenchmarkSchedule({ ...input, datasetName: dataset.name });
}

export async function activateBenchmarkSchedule(id: number, rawCookie: string | undefined) {
  if (process.env.NODE_ENV !== "production") throw new Error("Publish the site before activating a recurring schedule. Draft schedules can be configured locally.");
  const schedule = await db.getBenchmarkSchedule(id);
  if (!schedule) throw new Error("Benchmark schedule was not found.");
  const sessionToken = parseCookie(rawCookie ?? "")[COOKIE_NAME] ?? "";
  const job = await createHeartbeatJob({ name: `semantic-benchmark-${schedule.id}`, cron: schedule.cron, path: "/api/scheduled/benchmark", payload: { scheduleId: schedule.id }, description: `Recurring semantic evaluation: ${schedule.name}` }, sessionToken);
  return db.activateBenchmarkSchedule(schedule.id, job.taskUid, job.nextExecutionAt);
}

export async function listAutomationState() { const [schedules, alertPolicy, alerts] = await Promise.all([db.listBenchmarkSchedules(), db.ensureAlertPolicy(), db.listRegressionAlerts()]); const scheduleHistory = await Promise.all(schedules.map(async schedule => ({ scheduleId: schedule.id, runs: await db.listEvaluationRunsForSchedule(schedule.id) }))); return { schedules, alertPolicy, alerts, scheduleHistory }; }
export async function updateRegressionPolicy(input: Pick<AlertPolicy, "safetyThreshold" | "groundingThreshold" | "enabled">) { return db.updateAlertPolicy(input); }
export async function acknowledgeAlert(id: number) { return db.acknowledgeRegressionAlert(id); }

export function collectRegressionAlerts(policy: AlertPolicy, runId: number, scheduleId: number | null, values: { safetyRate: number; groundingRate: number }) {
  if (!policy.enabled) return [];
  const alerts: Array<{ scheduleId: number | null; evaluationRunId: number; metric: "safety" | "grounding"; observedValue: number; thresholdValue: number }> = [];
  if (values.safetyRate < policy.safetyThreshold) alerts.push({ scheduleId, evaluationRunId: runId, metric: "safety", observedValue: values.safetyRate, thresholdValue: policy.safetyThreshold });
  if (values.groundingRate < policy.groundingThreshold) alerts.push({ scheduleId, evaluationRunId: runId, metric: "grounding", observedValue: values.groundingRate, thresholdValue: policy.groundingThreshold });
  return alerts;
}

export async function executeBenchmarkSchedule(schedule: BenchmarkSchedule, options: { notify?: boolean } = {}) {
  if (!schedule.enabled) return { skipped: "schedule_disabled" as const };
  if (schedule.lastRunAt && Date.now() - new Date(schedule.lastRunAt).getTime() < 55_000) return { skipped: "recently_executed" as const };
  const run = await runEvaluation({ datasetId: schedule.datasetId, modelLabel: "Grounded compiler v1 · scheduled", retrievalDepth: schedule.retrievalDepth, baselineMode: schedule.baselineMode, scheduleId: schedule.id });
  const policy = await db.ensureAlertPolicy();
  const alerts = collectRegressionAlerts(policy, run.id, schedule.id, run);
  await db.createRegressionAlerts(alerts);
  if (alerts.length && options.notify !== false) await notifyOwner({ title: `Semantic reliability regression in ${schedule.name}`, content: alerts.map(alert => `${alert.metric}: observed ${Math.round(alert.observedValue * 100)}% below the ${Math.round(alert.thresholdValue * 100)}% policy floor.`).join(" ") });
  await db.updateScheduleExecution(schedule.id);
  return { run, alertsCreated: alerts.length > 0 };
}

export async function executeEvaluationWithAlerts(input: { datasetId: number; modelLabel: string; retrievalDepth: number; baselineMode: "direct_sql" | "schema_prompt" }, scheduleId: number | null = null) {
  const run = await runEvaluation(input);
  const policy = await db.ensureAlertPolicy();
  const alerts = collectRegressionAlerts(policy, run.id, scheduleId, run);
  await db.createRegressionAlerts(alerts);
  if (alerts.length) await notifyOwner({ title: "Semantic reliability regression detected", content: alerts.map(alert => `${alert.metric}: observed ${Math.round(alert.observedValue * 100)}% below the ${Math.round(alert.thresholdValue * 100)}% policy floor.`).join(" ") });
  return run;
}
