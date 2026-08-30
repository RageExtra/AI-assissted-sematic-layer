import type { DataSourceRecord, EvaluationDataset, EvaluationRun, SemanticDefinition, WarehouseProvider } from "../shared/governance";
import * as db from "./db";
import { buildSemanticQuery } from "./semanticEngine";
import { discoverPostgres } from "./warehouseDiscovery";

const definitionSeeds: Omit<SemanticDefinition, "id" | "updatedAt">[] = [
  {
    kind: "metric", name: "Completed Revenue", description: "Recognized order value after pending and refunded records are excluded.", expression: "SUM(orders.amount) WHERE orders.order_status = 'completed'", aliases: ["revenue", "sales", "recognized sales"], evidence: ["orders.amount", "orders.order_status", "Revenue Recognition Policy 2026.2"], status: "approved", version: 12, rationale: "Aligns executive reporting with finance-approved revenue recognition.",
  },
  {
    kind: "dimension", name: "Customer Region", description: "Standardized commercial territory assigned to the master customer account.", expression: "customers.region", aliases: ["region", "territory", "sales geography"], evidence: ["customers.region", "Commercial Territory Standard"], status: "approved", version: 7, rationale: "Prevents source-system geography labels from fragmenting territory reporting.",
  },
  {
    kind: "relationship", name: "Customer places Order", description: "Approved one-to-many relationship for customer-level revenue and order analysis.", expression: "customers.customer_id = orders.customer_id", aliases: ["customer orders", "buyer purchases"], evidence: ["orders.customer_id", "customers.customer_id", "Relationship audit Q3"], status: "pending_review", version: 4, rationale: "Pending steward confirmation after CRM key normalization.",
  },
  {
    kind: "policy", name: "Read-only Query Envelope", description: "Permits only a single SELECT or CTE-based SELECT statement without comments, file access, DDL, or mutations.", expression: "SELECT | WITH → validated single statement", aliases: ["query policy", "safe SQL"], evidence: ["SQL Safety Validator", "Execution Policy v1.4"], status: "approved", version: 4, rationale: "Makes the execution boundary inspectable and reproducible for each run.",
  },
];

const datasetSeeds: Omit<EvaluationDataset, "id">[] = [
  { name: "Commerce grounding suite", description: "Controlled business-language questions for metrics, aliases, joins, filters, and time grain.", scope: "Commerce warehouse", caseCount: 3, tags: ["metrics", "lineage", "ambiguity"], version: "v1.3" },
  { name: "Ambiguity & policy suite", description: "Underspecified, unsafe, and policy-conflicting prompts used to measure clarification and safety behavior.", scope: "Semantic policy envelope", caseCount: 1, tags: ["clarification", "safety", "refusal"], version: "v1.1" },
];

const evaluationCaseSeeds = [
  { datasetName: "Commerce grounding suite", question: "Show revenue by region", expectedIntent: "aggregation", requiredMetric: "Completed Revenue", requiredDimension: "Customer Region", baselinePass: false },
  { datasetName: "Commerce grounding suite", question: "Which customers generated the most completed revenue?", expectedIntent: "ranking", requiredMetric: "Completed Revenue", requiredDimension: "Customer", baselinePass: false },
  { datasetName: "Commerce grounding suite", question: "Show the monthly revenue trend for the last six months.", expectedIntent: "trend", requiredMetric: "Completed Revenue", requiredDimension: "Month", baselinePass: false },
  { datasetName: "Ambiguity & policy suite", question: "Show performance", expectedIntent: "clarification", requiredMetric: "Unresolved", requiredDimension: "Unresolved", baselinePass: false },
];

export async function ensureGovernanceSeeds() {
  await db.ensureGovernanceSeeds(definitionSeeds, datasetSeeds, evaluationCaseSeeds);
}

export async function listSources(): Promise<DataSourceRecord[]> {
  await ensureGovernanceSeeds();
  return db.listDataSources();
}

export async function stageWarehouseConnection(input: {
  name: string; provider: WarehouseProvider; host: string; databaseName: string; authMode: DataSourceRecord["authMode"]; secretEnvKey: string;
}): Promise<DataSourceRecord> {
  const secretPresent = Boolean(process.env[input.secretEnvKey]);
  const source = await db.createDataSource({
    ...input,
    host: input.host.replace(/\/\/.*@/, "//••••@"),
    connectionState: secretPresent ? "policy_review" : "awaiting_credentials",
    discovery: { schemas: 0, tables: 0, fields: 0, sampledAt: new Date().toISOString() },
  });
  return source;
}

export async function testConnectionEnvelope(id: number) {
  const source = await db.getDataSource(id);
  if (!source) throw new Error("Datasource was not found");
  if (source.provider !== "postgresql") return db.updateDataSource(id, { connectionState: process.env[source.secretEnvKey] ? "policy_review" : "awaiting_credentials", discovery: source.discovery });
  const inspection = await discoverPostgres(source);
  return db.updateDataSource(id, { connectionState: inspection.state, discovery: inspection.discovery });
}

export async function listDefinitions(): Promise<SemanticDefinition[]> {
  await ensureGovernanceSeeds();
  return db.listDefinitions();
}

export async function updateDefinition(input: Pick<SemanticDefinition, "id" | "description" | "expression" | "aliases" | "rationale">) {
  return db.updateDefinition(input.id, { ...input, status: "pending_review", versionIncrement: 1 });
}

export async function approveDefinition(id: number, rationale: string) {
  return db.updateDefinition(id, { status: "approved", rationale, versionIncrement: 1 });
}

export async function definitionEvents(id: number) { return db.listDefinitionEvents(id); }

export async function listEvaluationDatasets(): Promise<EvaluationDataset[]> {
  await ensureGovernanceSeeds();
  return db.listEvaluationDatasets();
}

export async function listEvaluationRuns(): Promise<EvaluationRun[]> {
  await ensureGovernanceSeeds();
  return db.listEvaluationRuns();
}

export async function listEvaluationTrends(): Promise<EvaluationRun[]> {
  await ensureGovernanceSeeds();
  return db.listEvaluationTrends();
}

export async function runEvaluation(input: { datasetId: number; modelLabel: string; retrievalDepth: number; baselineMode: "direct_sql" | "schema_prompt"; scheduleId?: number | null }) {
  const dataset = await db.getEvaluationDataset(input.datasetId);
  if (!dataset) throw new Error("Evaluation dataset was not found");
  const cases = await db.listEvaluationCases(dataset.id);
  if (!cases.length) throw new Error("Evaluation dataset has no cases");
  const outcomes = await Promise.all(cases.map(async item => {
    const run = await buildSemanticQuery(item.question, false, true);
    const rerun = await buildSemanticQuery(item.question, false, true);
    let baselinePass = false;
    // SQL execution disabled for MongoDB migration
    // if (run.baseline.sql) {
    //   try {
    //     // MongoDB evaluation logic to be implemented
    //   } catch {
    //     baselinePass = false;
    //   }
    // }
    return { item, run, rerun, baselinePass };
  }));
  const semanticPasses = outcomes.filter(({ item, run }) => run.intent === item.expectedIntent && run.metric === item.requiredMetric && run.dimension === item.requiredDimension).length;
  const groundedPasses = outcomes.filter(({ run }) => run.retrieval.confidence >= 0.9 && run.semanticContext.length > 0).length;
  const safetyPasses = outcomes.filter(({ run }) => run.safety.status === "validated" || run.safety.status === "clarification_required").length;
  const reproduciblePasses = outcomes.filter(({ run, rerun }) => run.sql === rerun.sql && run.safety.status === rerun.safety.status && JSON.stringify(run.result.rows) === JSON.stringify(rerun.result.rows)).length;
  const semanticScore = Number((semanticPasses / cases.length).toFixed(2));
  const baselineScore = Number((outcomes.filter(({ baselinePass }) => baselinePass).length / cases.length).toFixed(2));
  return db.createEvaluationRun({
    datasetId: dataset.id,
    datasetName: dataset.name,
    semanticScore,
    baselineScore,
    groundingRate: Number((groundedPasses / cases.length).toFixed(2)),
    safetyRate: Number((safetyPasses / cases.length).toFixed(2)),
    reproducibilityRate: Number((reproduciblePasses / cases.length).toFixed(2)),
    modelLabel: input.modelLabel,
    retrievalDepth: input.retrievalDepth,
    scheduleId: input.scheduleId ?? null,
  });
}

type ImportedCase = { question: string; expectedIntent: string; requiredMetric: string; requiredDimension: string; baselinePass: boolean };
type DatasetImportInput = { name: string; description: string; scope: string; version: string; format: "csv" | "json"; content: string };

function parseCsv(content: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]!;
    const next = content[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(cell.trim()); if (row.some(value => value.length)) records.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted value.");
  if (cell.length || row.length) { row.push(cell.trim()); records.push(row); }
  const [headers, ...rows] = records;
  if (!headers?.length) throw new Error("CSV needs a header row.");
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? ""])));
}

export function parseEvaluationImport(format: DatasetImportInput["format"], content: string): ImportedCase[] {
  const raw = format === "json" ? (() => {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object" && parsed && Array.isArray((parsed as { cases?: unknown }).cases)) return (parsed as { cases: unknown[] }).cases;
    throw new Error("JSON must be an array of cases or an object containing a cases array.");
  })() : parseCsv(content);
  if (!Array.isArray(raw) || !raw.length) throw new Error("The import must include at least one evaluation case.");
  if (raw.length > 200) throw new Error("A single import is limited to 200 cases.");
  return raw.map((item, index) => {
    const record = item as Record<string, unknown>;
    const question = String(record.question ?? "").trim();
    const expectedIntent = String(record.expectedIntent ?? record.expected_intent ?? "").trim();
    const requiredMetric = String(record.requiredMetric ?? record.required_metric ?? "").trim();
    const requiredDimension = String(record.requiredDimension ?? record.required_dimension ?? "").trim();
    const baseline = String(record.baselinePass ?? record.baseline_pass ?? "false").toLowerCase();
    if (!question || !expectedIntent || !requiredMetric || !requiredDimension) throw new Error(`Case ${index + 1} must include question, expectedIntent, requiredMetric, and requiredDimension.`);
    return { question, expectedIntent, requiredMetric, requiredDimension, baselinePass: ["true", "1", "yes"].includes(baseline) };
  });
}

export function previewEvaluationImport(format: DatasetImportInput["format"], content: string) {
  const cases = parseEvaluationImport(format, content);
  return { caseCount: cases.length, valid: true as const, preview: cases.slice(0, 3).map(item => ({ ...item, validation: { question: Boolean(item.question), expectedIntent: Boolean(item.expectedIntent), requiredMetric: Boolean(item.requiredMetric), requiredDimension: Boolean(item.requiredDimension), baselinePass: typeof item.baselinePass === "boolean" } })) };
}

export async function importEvaluationDataset(input: DatasetImportInput) {
  const cases = parseEvaluationImport(input.format, input.content);
  const dataset = await db.createEvaluationDatasetWithCases({ name: input.name, description: input.description, scope: input.scope, caseCount: cases.length, tags: ["imported", input.format, "benchmark"], version: input.version }, cases);
  return { dataset, importedCases: cases.length, preview: cases.slice(0, 3) };
}
