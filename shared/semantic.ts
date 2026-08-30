export type QueryIntent = "aggregation" | "ranking" | "trend" | "clarification" | "propose_definition";

export type GroundingItem = {
  kind: "entity" | "metric" | "dimension" | "relationship" | "alias" | "business_rule";
  label: string;
  source: string;
  confidence: number;
  detail: string;
};

export type QueryResult = {
  columns: string[];
  rows: Array<Record<string, string | number>>;
  summary: string;
};

export type SqlSafety = {
  status: "validated" | "clarification_required" | "rejected";
  score: number;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
};

export type SemanticQueryRun = {
  id: string;
  question: string;
  createdAt: string;
  intent: QueryIntent;
  confidence: number;
  entities: string[];
  metric: string;
  dimension: string;
  semanticContext: GroundingItem[];
  retrieval: { sources: string[]; matchedChunks: number; confidence: number };
  ambiguity: { detected: boolean; explanation?: string; questions: string[] };
  sql: string;
  sqlExplanation: string;
  safety: SqlSafety;
  result: QueryResult;
  answer: string;
  llm: { used: boolean; status: "grounded" | "fallback"; note: string };
  baseline: { sql: string; score: number; note: string };
};
