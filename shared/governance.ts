export type WarehouseProvider = "postgresql" | "snowflake" | "bigquery" | "databricks" | "redshift" | "mysql";
export type DefinitionKind = "entity" | "metric" | "dimension" | "relationship" | "policy";
export type DefinitionStatus = "draft" | "pending_review" | "approved";

export type DataSourceRecord = {
  id: number;
  name: string;
  provider: WarehouseProvider;
  host: string;
  databaseName: string;
  authMode: "environment_uri" | "service_account" | "access_token";
  secretEnvKey: string;
  connectionState: "ready" | "awaiting_credentials" | "policy_review";
  discovery: { schemas: number; tables: number; fields: number; sampledAt: string };
  createdAt: string;
};

export type SemanticDefinition = {
  id: number;
  kind: DefinitionKind;
  name: string;
  description: string;
  expression: string;
  aliases: string[];
  evidence: string[];
  status: DefinitionStatus;
  version: number;
  rationale: string;
  updatedAt: string;
};

export type EvaluationDataset = {
  id: number;
  name: string;
  description: string;
  scope: string;
  caseCount: number;
  tags: string[];
  version: string;
};

export type EvaluationRun = {
  id: number;
  datasetId: number;
  datasetName: string;
  semanticScore: number;
  baselineScore: number;
  groundingRate: number;
  safetyRate: number;
  reproducibilityRate: number;
  modelLabel: string;
  retrievalDepth: number;
  scheduleId?: number | null;
  createdAt: string;
};

export type EvaluationCase = {
  id: number;
  datasetId: number;
  question: string;
  expectedIntent: string;
  requiredMetric: string;
  requiredDimension: string;
  baselinePass: boolean;
};

export type DefinitionEvent = {
  id: number;
  definitionId: number;
  eventType: "created" | "edited" | "approved";
  version: number;
  rationale: string;
  createdAt: string;
};

export type StewardMember = { id: number; name: string | null; email: string | null; stewardRole: "viewer" | "editor" | "approver"; role: "user" | "admin"; lastSignedIn: string };
export type BenchmarkSchedule = { id: number; name: string; datasetId: number; datasetName: string; cron: string; baselineMode: "direct_sql" | "schema_prompt"; retrievalDepth: number; enabled: boolean; scheduleCronTaskUid: string | null; lastRunAt: string | null; nextRunAt: string | null; createdAt: string };
export type AlertPolicy = { id: number; safetyThreshold: number; groundingThreshold: number; enabled: boolean; updatedAt: string };
export type RegressionAlert = { id: number; scheduleId: number | null; evaluationRunId: number; metric: "safety" | "grounding"; observedValue: number; thresholdValue: number; status: "open" | "acknowledged"; createdAt: string };
