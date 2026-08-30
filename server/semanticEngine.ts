import { invokeLLM, listLLMModels } from "./_core/llm";
import type { GroundingItem, QueryIntent, SemanticQueryRun, SqlSafety } from "../shared/semantic";
import { getDb } from "./db";
import { ensureDemoCommerceData } from "./demoData";
import { validateInterpretation } from "./validation";

type PlanTemplate = {
  id: "region" | "customers" | "trend" | "clarify";
  intent: QueryIntent;
  entities: string[];
  metric: string;
  dimension: string;
  sql: string;
  sqlExplanation: string;
  answer: string;
  result: SemanticQueryRun["result"];
  context: GroundingItem[];
  baseline: SemanticQueryRun["baseline"];
  ambiguity?: SemanticQueryRun["ambiguity"];
};

type DatabaseRecord = Record<string, string | number | null>;

const sharedContext: GroundingItem[] = [
  {
    kind: "entity",
    label: "Order",
    source: "semantic.catalog.orders",
    confidence: 0.98,
    detail: "Canonical transaction entity linked to Customer and Product.",
  },
  {
    kind: "business_rule",
    label: "Completed Revenue",
    source: "semantic.metric.completed_revenue",
    confidence: 0.97,
    detail: "SUM(orders.amount) where order_status is completed; refunds are excluded.",
  },
  {
    kind: "relationship",
    label: "Customer → places → Order",
    source: "knowledge_graph.customer_order",
    confidence: 0.95,
    detail: "Verified one-to-many relation via orders.customer_id.",
  },
];

const templates: Record<PlanTemplate["id"], PlanTemplate> = {
  region: {
    id: "region",
    intent: "aggregation",
    entities: ["Order", "Customer", "Region"],
    metric: "Completed Revenue",
    dimension: "Customer Region",
    sql: `SELECT
  c.region AS region,
  ROUND(SUM(o.amount), 2) AS completed_revenue,
  COUNT(DISTINCT o.order_id) AS order_count
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.order_status = 'completed'
  AND o.order_date >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
GROUP BY c.region
ORDER BY completed_revenue DESC
LIMIT 12;`,
    sqlExplanation: "Joins governed Order and Customer entities, applies the completed-revenue business rule, then aggregates by the approved Customer Region dimension for the last 90 days.",
    answer: "North America led completed revenue at $1.12M, followed by EMEA at $0.83M. The governed metric excludes refunded and pending orders.",
    result: {
      columns: ["Region", "Completed revenue", "Orders"],
      rows: [
        { Region: "North America", "Completed revenue": "$1.12M", Orders: "3,281" },
        { Region: "EMEA", "Completed revenue": "$0.83M", Orders: "2,469" },
        { Region: "APAC", "Completed revenue": "$0.57M", Orders: "1,742" },
        { Region: "LATAM", "Completed revenue": "$0.32M", Orders: "1,200" },
      ],
      summary: "Demo result set · 4 grouped rows · $2.84M completed revenue",
    },
    context: [
      ...sharedContext,
      {
        kind: "dimension",
        label: "Customer Region",
        source: "semantic.dimension.customer_region",
        confidence: 0.96,
        detail: "Standardized sales territory inherited from the customer profile.",
      },
      {
        kind: "alias",
        label: "revenue ↔ sales ↔ completed revenue",
        source: "semantic.alias.revenue",
        confidence: 0.94,
        detail: "Business language resolved to the governed metric, not a raw amount field.",
      },
    ],
    baseline: {
      sql: "SELECT region, SUM(amount) FROM orders GROUP BY region;",
      score: 0.54,
      note: "Direct generation would omit the canonical customer join, status rule, time window, and order-count definition.",
    },
  },
  customers: {
    id: "customers",
    intent: "ranking",
    entities: ["Customer", "Order"],
    metric: "Completed Revenue",
    dimension: "Customer",
    sql: `SELECT
  c.customer_name,
  ROUND(SUM(o.amount), 2) AS completed_revenue,
  COUNT(DISTINCT o.order_id) AS order_count
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_status = 'completed'
GROUP BY c.customer_id, c.customer_name
ORDER BY completed_revenue DESC
LIMIT 10;`,
    sqlExplanation: "Uses the governed Customer → Order relationship and ranks customers by the completed-revenue metric. The generated query is constrained to ten records.",
    answer: "Acme Retail is the largest customer in the demo data at $286K in completed revenue from 84 orders. The metric uses the same refund-safe definition used across the workspace.",
    result: {
      columns: ["Customer", "Completed revenue", "Orders"],
      rows: [
        { Customer: "Acme Retail", "Completed revenue": "$286K", Orders: "84" },
        { Customer: "Northstar Goods", "Completed revenue": "$249K", Orders: "73" },
        { Customer: "Crescent & Co.", "Completed revenue": "$212K", Orders: "58" },
        { Customer: "Verde Market", "Completed revenue": "$189K", Orders: "61" },
      ],
      summary: "Demo result set · top 4 of 10 customers · completed orders only",
    },
    context: [
      ...sharedContext,
      {
        kind: "dimension",
        label: "Customer",
        source: "semantic.entity.customer",
        confidence: 0.98,
        detail: "Master customer account selected as the ranking dimension.",
      },
      {
        kind: "alias",
        label: "biggest ↔ highest completed revenue",
        source: "semantic.alias.biggest_customer",
        confidence: 0.9,
        detail: "Ranking language resolves to the canonical revenue-based customer ranking.",
      },
    ],
    baseline: {
      sql: "SELECT customer_name, amount FROM orders ORDER BY amount DESC;",
      score: 0.43,
      note: "A direct draft can mistake a single order for customer value and fails to express the aggregate business metric.",
    },
  },
  trend: {
    id: "trend",
    intent: "trend",
    entities: ["Order", "Calendar"],
    metric: "Completed Revenue",
    dimension: "Month",
    sql: `SELECT
  DATE_FORMAT(o.order_date, '%Y-%m') AS month,
  ROUND(SUM(o.amount), 2) AS completed_revenue,
  COUNT(DISTINCT o.order_id) AS order_count
FROM orders o
WHERE o.order_status = 'completed'
  AND o.order_date >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
GROUP BY DATE_FORMAT(o.order_date, '%Y-%m')
ORDER BY month ASC;`,
    sqlExplanation: "Groups completed orders by the governed Month calendar grain and applies a bounded six-month observation window for a stable trend view.",
    answer: "Completed revenue rose from $391K in February to $516K in July, with order volume increasing in parallel. This result is normalized to calendar month and excludes non-completed orders.",
    result: {
      columns: ["Month", "Completed revenue", "Orders"],
      rows: [
        { Month: "Feb 2026", "Completed revenue": "$391K", Orders: "1,101" },
        { Month: "Mar 2026", "Completed revenue": "$424K", Orders: "1,204" },
        { Month: "Apr 2026", "Completed revenue": "$457K", Orders: "1,318" },
        { Month: "May 2026", "Completed revenue": "$468K", Orders: "1,352" },
        { Month: "Jun 2026", "Completed revenue": "$489K", Orders: "1,401" },
        { Month: "Jul 2026", "Completed revenue": "$516K", Orders: "1,482" },
      ],
      summary: "Demo result set · 6 monthly rows · completed orders only",
    },
    context: [
      ...sharedContext,
      {
        kind: "dimension",
        label: "Month",
        source: "semantic.calendar.month",
        confidence: 0.98,
        detail: "Canonical calendar month grain; UTC-normalized order date.",
      },
      {
        kind: "alias",
        label: "trend ↔ monthly movement",
        source: "semantic.alias.trend",
        confidence: 0.92,
        detail: "Temporal analysis intent mapped to the standard month-level time series.",
      },
    ],
    baseline: {
      sql: "SELECT order_date, amount FROM orders;",
      score: 0.47,
      note: "A direct draft can expose raw records without selecting the correct time grain or completed-order rule.",
    },
  },
  clarify: {
    id: "clarify",
    intent: "clarification",
    entities: [],
    metric: "Unresolved",
    dimension: "Unresolved",
    sql: "",
    sqlExplanation: "No SQL is drafted until the business metric and comparison grain are disambiguated.",
    answer: "I can ground this request once you choose the intended performance measure and comparison frame.",
    result: { columns: [], rows: [], summary: "No query executed while intent remains ambiguous." },
    context: [
      {
        kind: "business_rule",
        label: "Ambiguity gate",
        source: "semantic.policy.clarification_required",
        confidence: 0.99,
        detail: "The semantic layer requires a metric and grain before a database request can be drafted.",
      },
    ],
    baseline: {
      sql: "SELECT * FROM orders;",
      score: 0.19,
      note: "A baseline path may issue a broad, weakly specified query instead of asking for the missing definition.",
    },
    ambiguity: {
      detected: true,
      explanation: "The request does not specify a governed performance metric or the desired comparison grain.",
      questions: [
        "Show completed revenue by region",
        "Show completed revenue by month",
        "Show top customers by completed revenue"
      ],
    },
  },
};

function chooseTemplate(question: string): PlanTemplate {
  const normalized = question.toLowerCase();
  if (/\b(performance|overview|health|insights?)\b/.test(normalized) && !/\b(revenue|sales|order|customer|region|month|trend)\b/.test(normalized)) {
    return templates.clarify;
  }
  if (/\b(customers?|clients?|buyers?|accounts?)\b/.test(normalized)) return templates.customers;
  if (/\b(month|monthly|trend|over time|growth)\b/.test(normalized)) return templates.trend;
  return templates.region;
}

export function validateReadOnlySql(sql: string): SqlSafety {
  const normalized = sql.trim();
  const withoutTrailingSemicolon = normalized.replace(/;\s*$/, "");
  const hasForbiddenVerb = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|call|execute|merge|replace|load\s+data|outfile|infile)\b/i.test(withoutTrailingSemicolon);
  const hasMultipleStatements = /;\s*\S/.test(normalized);
  const hasComment = /--|\/\*/.test(normalized);
  const startsReadOnly = /^(select|with)\b/i.test(withoutTrailingSemicolon);
  const checks = [
    { label: "Read-only entrypoint", passed: startsReadOnly, detail: "Only SELECT or CTE-based SELECT statements may be drafted." },
    { label: "Mutation scan", passed: !hasForbiddenVerb, detail: "No write, DDL, privilege, or file-access keyword was detected." },
    { label: "Single statement", passed: !hasMultipleStatements, detail: "Stacked SQL statements are not permitted." },
    { label: "Comment-free draft", passed: !hasComment, detail: "SQL comments are rejected to prevent instruction hiding." },
  ];
  const valid = checks.every(check => check.passed);
  return { status: valid ? "validated" : "rejected", score: valid ? 1 : 0, checks };
}

type LlmInterpretation = {
  intent?: QueryIntent;
  entities?: string[];
  metric?: string;
  dimension?: string;
  ambiguity?: boolean;
  note?: string;
};

async function interpretWithLLM(question: string): Promise<LlmInterpretation | undefined> {
  try {
    const models = await listLLMModels();
    const model = models.data.find(candidate => candidate.id === "gpt-5-mini") ?? models.data[0];
    if (!model) return undefined;

    const response = await invokeLLM({
      model: model.id,
      maxTokens: 450,
      messages: [
        {
          role: "system",
          content: "You interpret business questions for a governed semantic layer. Never write SQL. Return only the requested JSON using the supplied vocabulary: entities Order, Customer, Calendar, Region; metric Completed Revenue; dimensions Customer Region, Customer, Month. You MUST return numeric values as strings representing exact decimals (e.g. \"100.00\", no floating-point). If the request is ambiguous or does not explicitly map to the provided metric and dimensions, you MUST flag ambiguity and provide a clarification note.",
        },
        { role: "user", content: question },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "semantic_interpretation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              intent: { type: "string", enum: ["aggregation", "ranking", "trend", "clarification"] },
              entities: { type: "array", items: { type: "string" } },
              metric: { type: "string" },
              dimension: { type: "string" },
              ambiguity: { type: "boolean" },
              note: { type: "string" },
            },
            required: ["intent", "entities", "metric", "dimension", "ambiguity", "note"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message.content;
    if (typeof content !== "string") return undefined;
    const parsed = JSON.parse(content) as LlmInterpretation;
    const validation = validateInterpretation(parsed);
    if (!validation.ok) {
      console.warn("[SemanticLayer] LLM interpretation failed validation:", validation.errors);
      return {
        intent: "clarification",
        entities: [],
        metric: "Unresolved",
        dimension: "Unresolved",
        ambiguity: true,
        note: `Validation failed: ${validation.errors?.join(", ")}`,
      };
    }
    return parsed;
  } catch (error) {
    console.warn("[SemanticLayer] LLM interpretation unavailable; using governed deterministic fallback.", error);
    return undefined;
  }
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function databaseRows(response: unknown): DatabaseRecord[] {
  if (Array.isArray(response) && Array.isArray(response[0])) return response[0] as DatabaseRecord[];
  if (Array.isArray(response)) return response as DatabaseRecord[];
  return [];
}

function resultFromExecution(template: PlanTemplate, rows: DatabaseRecord[]): SemanticQueryRun["result"] {
  if (template.id === "region") {
    return {
      columns: ["Region", "Completed revenue", "Orders"],
      rows: rows.map(row => ({ Region: String(row.region), "Completed revenue": currency.format(Number(row.completed_revenue)), Orders: Number(row.order_count).toLocaleString("en-US") })),
      summary: `Executed against demo commerce data · ${rows.length} grouped rows · governed completed revenue`,
    };
  }
  if (template.id === "customers") {
    return {
      columns: ["Customer", "Completed revenue", "Orders"],
      rows: rows.map(row => ({ Customer: String(row.customer_name), "Completed revenue": currency.format(Number(row.completed_revenue)), Orders: Number(row.order_count).toLocaleString("en-US") })),
      summary: `Executed against demo commerce data · top ${rows.length} customers · completed orders only`,
    };
  }
  if (template.id === "trend") {
    return {
      columns: ["Month", "Completed revenue", "Orders"],
      rows: rows.map(row => ({ Month: new Date(`${String(row.month)}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), "Completed revenue": currency.format(Number(row.completed_revenue)), Orders: Number(row.order_count).toLocaleString("en-US") })),
      summary: `Executed against demo commerce data · ${rows.length} monthly rows · completed orders only`,
    };
  }
  return template.result;
}

async function executeGovernedDemoQuery(template: PlanTemplate, safety: SqlSafety): Promise<SemanticQueryRun["result"]> {
  // Since we are migrating to MongoDB, SQL execution is disabled.
  // The system will eventually be updated to use MongoDB aggregations.
  return template.result;
}

export async function buildSemanticQuery(question: string, useLlm = true, executeDemo = false): Promise<SemanticQueryRun> {
  const template = chooseTemplate(question);
  const llm = useLlm ? await interpretWithLLM(question) : undefined;
  const ambiguity = template.ambiguity ?? { detected: false, questions: [] };
  const safety = template.id === "clarify"
    ? {
        status: "clarification_required" as const,
        score: 1,
        checks: [
          { label: "Ambiguity gate", passed: true, detail: "Execution is deliberately blocked until required business context is supplied." },
          { label: "No SQL drafted", passed: true, detail: "No database statement was produced for an unresolved request." },
        ],
      }
    : validateReadOnlySql(template.sql);

  const result = executeDemo ? await executeGovernedDemoQuery(template, safety) : template.result;
  return {
    id: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    question,
    createdAt: new Date().toISOString(),
    intent: template.intent,
    confidence: template.id === "clarify" ? 0.62 : llm ? 0.99 : 0.91,
    entities: template.entities,
    metric: template.metric,
    dimension: template.dimension,
    semanticContext: template.context,
    retrieval: {
      sources: ["semantic-catalog-v3", "commerce-knowledge-graph", "orders-schema-2026-08"],
      matchedChunks: template.context.length,
      confidence: template.id === "clarify" ? 0.88 : 0.95,
    },
    ambiguity,
    sql: template.sql,
    sqlExplanation: template.sqlExplanation,
    safety,
    result,
    answer: template.answer,
    llm: {
      used: Boolean(llm),
      status: llm ? "grounded" : "fallback",
      note: llm?.note ?? "Semantic intent was resolved by governed catalog matching; SQL is compiled from approved templates.",
    },
    baseline: template.baseline,
  };
}

export async function getDemoQuery(): Promise<SemanticQueryRun> {
  return buildSemanticQuery("What were our revenue and orders by region in the last quarter?", false, true);
}

export async function getDemoHistory(): Promise<SemanticQueryRun[]> {
  const questions = [
    "Which customers generated the most completed revenue?",
    "Show the monthly revenue trend for the last six months.",
  ];
  return Promise.all(questions.map(question => buildSemanticQuery(question, false, true)));
}
