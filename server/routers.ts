import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, protectedProcedure, router, stewardProcedure } from "./_core/trpc";
import { getDemoHistory, getDemoQuery, buildSemanticQuery } from "./semanticEngine";
import { listQueryRuns, saveQueryFeedback, saveQueryRun } from "./db";
import { approveDefinition, definitionEvents, importEvaluationDataset, listDefinitions, listEvaluationDatasets, listEvaluationRuns, listEvaluationTrends, listSources, previewEvaluationImport, stageWarehouseConnection, testConnectionEnvelope, updateDefinition } from "./governance";
import { acknowledgeAlert, activateBenchmarkSchedule, executeEvaluationWithAlerts, listAutomationState, stageBenchmarkSchedule, updateRegressionPolicy } from "./automation";
import { answerBusinessQuestion, getDatasetJob, queueDatasetIngestion } from "./datasetEngine";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  ai: router({
    chat: publicProcedure
      .input(z.object({
        messages: z.array(z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().trim().min(1).max(2_000)
        })).min(1).max(24)
      }))
      .mutation(async ({ input }) => {
        const answer = await answerBusinessQuestion(input.messages);
        return { choices: [{ message: { role: "assistant" as const, content: answer } }] };
      })
  }),
  semantic: router({
    validate: publicProcedure
      .input(z.any())
      .mutation(async ({ input }) => {
        const { validateInterpretation } = await import("./validation");
        return validateInterpretation(input);
      }),
    demo: publicProcedure.query(() => getDemoQuery()),
    run: publicProcedure
      .input(z.object({ question: z.string().trim().min(3).max(500), useLlm: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const run = await buildSemanticQuery(input.question, input.useLlm ?? true, true);
        try {
          await saveQueryRun(run);
        } catch (error) {
          console.warn("[SemanticLayer] Query history could not be persisted.", error);
        }
        return run;
      }),
    history: publicProcedure.query(async () => {
      try {
        const stored = await listQueryRuns();
        if (stored.length) return stored;
      } catch (error) {
        console.warn("[SemanticLayer] Falling back to demonstration history.", error);
      }
      return getDemoHistory();
    }),
    feedback: publicProcedure
      .input(z.object({ runId: z.string().min(3).max(96), rating: z.enum(["helpful", "needs_review"]), note: z.string().trim().max(500).optional() }))
      .mutation(async ({ input }) => {
        await saveQueryFeedback(input);
        return { success: true } as const;
      }),
    uploadDataset: publicProcedure
      .input(z.object({ name: z.string().trim().min(1).max(160), data: z.array(z.unknown()).min(1).max(10_000) }))
      .mutation(async ({ input }) => queueDatasetIngestion(input.name, input.data)),
    datasetJob: publicProcedure
      .input(z.object({ jobId: z.string().uuid() }))
      .query(({ input }) => getDatasetJob(input.jobId)),
    uploadDocument: publicProcedure
      .input(z.object({ name: z.string().trim().min(1).max(240), fileType: z.string().trim().max(160), base64Data: z.string().min(1).max(28_000_000) }))
      .mutation(async ({ input }) => {
        try {
          console.log("[TRPC] Starting document upload:", input.name, input.fileType, "size:", input.base64Data.length);
          const { handleDocumentUpload } = await import("./semanticEngine");
          const result = await handleDocumentUpload(input.name, input.fileType, input.base64Data);
          console.log("[TRPC] Document upload success:", result);
          return result;
        } catch (err) {
          console.error("[TRPC] uploadDocument mutation failed:", err);
          throw err;
        }
      }),
  }),
  governance: router({
    members: adminProcedure.query(() => db.listStewardMembers()),
    assignStewardRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), stewardRole: z.enum(["viewer", "editor", "approver"]) })).mutation(({ input }) => db.assignStewardRole(input.userId, input.stewardRole)),
    sources: stewardProcedure(["viewer", "editor", "approver"]).query(() => listSources()),
    stageSource: stewardProcedure(["editor", "approver"]).input(z.object({ name: z.string().trim().min(3).max(128), provider: z.enum(["postgresql", "snowflake", "bigquery", "databricks", "redshift", "mysql"]), host: z.string().trim().min(3).max(256), databaseName: z.string().trim().min(1).max(128), authMode: z.enum(["environment_uri", "service_account", "access_token"]), secretEnvKey: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,127}$/) })).mutation(({ input }) => stageWarehouseConnection(input)),
    testSource: stewardProcedure(["editor", "approver"]).input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => testConnectionEnvelope(input.id)),
    definitions: stewardProcedure(["viewer", "editor", "approver"]).query(() => listDefinitions()),
    definitionEvents: stewardProcedure(["viewer", "editor", "approver"]).input(z.object({ id: z.number().int().positive() })).query(({ input }) => definitionEvents(input.id)),
    updateDefinition: stewardProcedure(["editor", "approver"]).input(z.object({ id: z.number().int().positive(), description: z.string().trim().min(5), expression: z.string().trim().min(3), aliases: z.array(z.string().trim().min(1)).min(1), rationale: z.string().trim().min(5) })).mutation(({ input }) => updateDefinition(input)),
    approveDefinition: stewardProcedure(["approver"]).input(z.object({ id: z.number().int().positive(), rationale: z.string().trim().min(5).max(800) })).mutation(({ input }) => approveDefinition(input.id, input.rationale)),
    datasets: stewardProcedure(["viewer", "editor", "approver"]).query(() => listEvaluationDatasets()),
    evaluationRuns: stewardProcedure(["viewer", "editor", "approver"]).query(() => listEvaluationRuns()),
    evaluationTrends: stewardProcedure(["viewer", "editor", "approver"]).query(() => listEvaluationTrends()),
    previewDataset: stewardProcedure(["editor", "approver"]).input(z.object({ format: z.enum(["csv", "json"]), content: z.string().min(2).max(300_000) })).mutation(({ input }) => previewEvaluationImport(input.format, input.content)),
    importDataset: stewardProcedure(["editor", "approver"]).input(z.object({ name: z.string().trim().min(3).max(160), description: z.string().trim().min(5).max(1200), scope: z.string().trim().min(2).max(160), version: z.string().trim().min(1).max(32), format: z.enum(["csv", "json"]), content: z.string().min(2).max(300_000) })).mutation(({ input }) => importEvaluationDataset(input)),
    runEvaluation: stewardProcedure(["editor", "approver"]).input(z.object({ datasetId: z.number().int().positive(), modelLabel: z.string().trim().min(2).max(96), retrievalDepth: z.number().int().min(1).max(8), baselineMode: z.enum(["direct_sql", "schema_prompt"]) })).mutation(({ input }) => executeEvaluationWithAlerts(input)),
    automationState: stewardProcedure(["viewer", "editor", "approver"]).query(() => listAutomationState()),
    stageSchedule: stewardProcedure(["approver"]).input(z.object({ name: z.string().trim().min(3).max(160), datasetId: z.number().int().positive(), cron: z.string().trim().min(9).max(64), baselineMode: z.enum(["direct_sql", "schema_prompt"]), retrievalDepth: z.number().int().min(1).max(8) })).mutation(({ input }) => stageBenchmarkSchedule(input)),
    activateSchedule: stewardProcedure(["approver"]).input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => activateBenchmarkSchedule(input.id, ctx.req.headers.cookie)),
    updateAlertPolicy: adminProcedure.input(z.object({ safetyThreshold: z.number().min(0.01).max(1), groundingThreshold: z.number().min(0.01).max(1), enabled: z.boolean() })).mutation(({ input }) => updateRegressionPolicy(input)),
    acknowledgeAlert: stewardProcedure(["approver"]).input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => acknowledgeAlert(input.id)),
  }),
  schema: router({
    design: stewardProcedure(["editor", "approver"])
      .input(z.object({ domain: z.string().trim().min(3).max(500) }))
      .mutation(async ({ input }) => {
        const { designSchema } = await import("./schemaDesigner");
        const result = await designSchema(input.domain);
        // Create MongoDB collections based on the generated schema
        const { createCollection } = await import("./db");
        if (result.collections && Array.isArray(result.collections)) {
          for (const col of result.collections) {
            await createCollection(col.name, col.jsonSchema, col.indexes);
          }
        }
        return result;
      }),

    inferDefinitions: stewardProcedure(["editor", "approver"])
      .input(z.object({ sql: z.string().trim().min(10) }))
      .mutation(async ({ input }) => {
        const { mapSemanticDefinitions } = await import("./semanticMapper");
        return mapSemanticDefinitions(input.sql);
      }),
    autoGenerate: stewardProcedure(["editor", "approver"]).input(z.object({ sourceId: z.number().int().positive() })).mutation(async ({ input }) => {
        const { autoGenerateSemanticDefinitions } = await import("./autoGenerate");
        return autoGenerateSemanticDefinitions(input.sourceId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
