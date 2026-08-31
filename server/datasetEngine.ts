import { generateAndExecuteMql } from "./mqlEngine.js";
import { generateEmbedding, cosineSimilarity } from "./_core/vector.js";
import { insertKnowledgeGraphEdges, searchKnowledgeGraph } from "./knowledgeGraph.js";
import { invokeLLM } from "./_core/llm";
import { getDb, createCollection, createDefinition } from "./db";
import { queryUnstructuredDocuments } from "./semanticEngine";

const MAX_ROWS = 10_000;
const MAX_FIELDS = 120;
const MAX_CONTEXT_ROWS = 20;

export type DatasetUploadResult = {
  success: true;
  datasetId: string;
  collectionName: string;
  rowCount: number;
  fieldCount: number;
  definitionsCreated: number;
  schema: Record<string, { type: string; nullable: boolean; examples: unknown[] }>;
};

type Row = Record<string, unknown>;

type FieldProfile = {
  type: "number" | "date" | "boolean" | "string" | "mixed";
  nullable: boolean;
  examples: unknown[];
};

function isPlainRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeIdentifier(value: string, fallback: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return (normalized || fallback).slice(0, 48);
}

function inferValueType(value: unknown): FieldProfile["type"] {
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "boolean";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return "date";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "string";
    if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/.test(trimmed)) return "date";
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return "number";
  }
  return "string";
}

function inferSchema(rows: Row[]) {
  const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).slice(0, MAX_FIELDS);
  const schema: Record<string, FieldProfile> = {};
  for (const key of keys) {
    const values = rows.map(row => row[key]).filter(value => value !== null && value !== undefined && value !== "");
    const types = Array.from(new Set(values.map(inferValueType)));
    schema[key] = {
      type: types.length === 1 ? (types[0] ?? "string") : "mixed",
      nullable: values.length !== rows.length,
      examples: values.slice(0, 3),
    };
  }
  return schema;
}

function metricLike(field: string, profile: FieldProfile) {
  return profile.type === "number" && /amount|amounts|revenue|sales|price|cost|profit|margin|value|total|count|quantity|balance|income|expense|ebitda|growth|rate|percent|percentage|score/i.test(field);
}

function readableField(field: string) {
  return field.replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function rowText(datasetName: string, row: Row) {
  return `${datasetName} dataset row: ${Object.entries(row).map(([key, value]) => `${readableField(key)}: ${String(value ?? "")}`).join(" | ")}`;
}

function tokenize(text: string) {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2));
}

function summarizeRows(rows: Row[]) {
  const fields = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).slice(0, MAX_FIELDS);
  return fields.map(field => {
    const values = rows.map(row => row[field]).filter(value => value !== null && value !== undefined && value !== "");
    const numeric = values.filter(value => typeof value === "number" && Number.isFinite(value)) as number[];
    if (numeric.length >= Math.max(2, values.length * 0.6)) {
      const sum = numeric.reduce((total, value) => total + value, 0);
      return `${readableField(field)}: numeric rows=${numeric.length}, sum=${sum}, average=${sum / numeric.length}, min=${Math.min(...numeric)}, max=${Math.max(...numeric)}`;
    }
    const counts = new Map<string, number>();
    for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
    const topValues = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([value, count]) => `${value} (${count})`);
    return `${readableField(field)}: categorical values=${topValues.join(", ")}`;
  }).join("\\n");
}

function retrieveRows(question: string, documents: Array<{ text: string; row: Row }>) {
  const questionTokens = tokenize(question);
  return documents
    .map(document => {
      const rowTokens = tokenize(document.text);
      let score = 0;
      questionTokens.forEach(token => { if (rowTokens.has(token)) score += 1; });
      return { ...document, score };
    })
    .filter(document => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXT_ROWS);
}

async function processDatasetUpload(name: string, inputRows: unknown[]): Promise<DatasetUploadResult> {
  if (!Array.isArray(inputRows) || inputRows.length === 0) throw new Error("The dataset must contain at least one row.");
  if (inputRows.length > MAX_ROWS) throw new Error(`The dataset is limited to ${MAX_ROWS.toLocaleString()} rows per upload.`);
  const rows = inputRows.filter(isPlainRecord).map(row => {
    const sanitized: Row = {};
    for (const [key, value] of Object.entries(row).slice(0, MAX_FIELDS)) {
      const cleanKey = key.trim().slice(0, 120);
      if (cleanKey) sanitized[cleanKey] = typeof value === "string" ? value.slice(0, 4000) : value;
    }
    return sanitized;
  });
  if (rows.length !== inputRows.length) throw new Error("Every dataset row must be a JSON object.");

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const datasetId = crypto.randomUUID();
  const collectionName = `dataset_${datasetId.replace(/-/g, "").slice(0, 24)}`;
  const datasetName = name.trim().replace(/\.[^.]+$/, "").slice(0, 160) || "Uploaded dataset";
  const inferred = inferSchema(rows);
  const schema = Object.fromEntries(Object.entries(inferred).map(([key, value]) => [key, value]));
  const mongoSchema = {
    bsonType: "object",
    properties: Object.fromEntries(Object.entries(inferred).map(([key, profile]) => [key, profile.type === "number" ? { bsonType: ["double", "int", "long", "decimal", "null"] } : profile.type === "boolean" ? { bsonType: ["bool", "null"] } : { bsonType: ["string", "date", "null"] }])),
  };
  await createCollection(collectionName, mongoSchema, [{ key: { _datasetId: 1 }, options: { name: "dataset_scope" } }]);
  await db.collection(collectionName).insertMany(rows.map(row => ({ ...row, _datasetId: datasetId })));
  await db.collection("uploadedDatasets").insertOne({
    id: datasetId,
    name: datasetName,
    collectionName,
    rowCount: rows.length,
    fieldCount: Object.keys(inferred).length,
    schema,
    summary: summarizeRows(rows),
    status: "ready",
    createdAt: new Date().toISOString(),
  });

  let definitionsCreated = 0;
  await createDefinition({
    kind: "entity",
    name: datasetName,
    description: `Uploaded business dataset containing ${rows.length.toLocaleString()} rows and ${Object.keys(inferred).length} fields.`,
    expression: collectionName,
    aliases: [datasetName.toLowerCase()],
    evidence: [datasetId],
    status: "pending_review",
    version: 1,
    rationale: "Generated from the uploaded dataset schema; review before using for regulated decisions.",
  });
  definitionsCreated += 1;

  for (const [field, profile] of Object.entries(inferred)) {
    const kind = metricLike(field, profile) ? "metric" : profile.type === "date" ? "dimension" : "dimension";
    await createDefinition({
      kind,
      name: `${datasetName} · ${readableField(field)}`,
      description: `${kind === "metric" ? "Numeric business measure" : "Business dimension"} inferred from the ${readableField(field)} field in ${datasetName}. Type: ${profile.type}; nullable: ${profile.nullable}.`,
      expression: `${collectionName}.${field}`,
      aliases: [field, field.replace(/[_-]+/g, " "), readableField(field)],
      evidence: [datasetId, `field:${field}`],
      status: "pending_review",
      version: 1,
      rationale: "Generated from observed uploaded values. Confirm business meaning and units before regulated use.",
    });
    definitionsCreated += 1;
  }

  await db.collection("datasetDocuments").insertMany(rows.slice(0, 2_000).map(row => ({
    datasetId,
    datasetName,
    text: rowText(datasetName, row),
    row,
    createdAt: new Date().toISOString(),
  })));
  await db.collection("datasetDocuments").createIndex({ text: "text" }, { name: "dataset_document_text_search" });

  return { success: true, datasetId, collectionName, rowCount: rows.length, fieldCount: Object.keys(inferred).length, definitionsCreated, schema };
}

export type DatasetJob = { jobId: string; status: "queued" | "processing" | "ready" | "failed"; result?: DatasetUploadResult; error?: string };

export async function queueDatasetIngestion(name: string, inputRows: unknown[]): Promise<DatasetJob> {
  if (!Array.isArray(inputRows) || inputRows.length === 0) throw new Error("The dataset must contain at least one row.");
  if (inputRows.length > MAX_ROWS) throw new Error(`The dataset is limited to ${MAX_ROWS.toLocaleString()} rows per upload.`);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const jobId = crypto.randomUUID();
  await db.collection("datasetJobs").insertOne({ jobId, name: name.trim().slice(0, 160), status: "queued", createdAt: new Date().toISOString() });
  setImmediate(async () => {
    try {
      await db.collection("datasetJobs").updateOne({ jobId }, { $set: { status: "processing", startedAt: new Date().toISOString() } });
      const result = await processDatasetUpload(name, inputRows);
      await db.collection("datasetJobs").updateOne({ jobId }, { $set: { status: "ready", result, completedAt: new Date().toISOString() } });
    } catch (error) {
      await db.collection("datasetJobs").updateOne({ jobId }, { $set: { status: "failed", error: error instanceof Error ? error.message : "Dataset processing failed", completedAt: new Date().toISOString() } });
    }
  });
  return { jobId, status: "queued" };
}

export async function getDatasetJob(jobId: string): Promise<DatasetJob | null> {
  const db = await getDb();
  if (!db) return null;
  const job = await db.collection("datasetJobs").findOne({ jobId });
  if (!job) return null;
  const result = { jobId, status: job.status, result: job.result, error: job.error } as DatasetJob;
  delete (result as { _id?: unknown })._id;
  return result;
}

let catalogCache: { value: string; expiresAt: number } | null = null;

async function getCatalogContext() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;
  const db = await getDb();
  if (!db) return "";
  const datasets = await db.collection("uploadedDatasets").find({ status: "ready" }).sort({ createdAt: -1 }).limit(20).toArray();
  const definitions = await db.collection("semanticDefinitions").find({ status: { $in: ["approved", "pending_review"] } }).sort({ updatedAt: -1 }).limit(120).toArray();
  const datasetSummaries = datasets.map(dataset => `DATASET SUMMARY: ${dataset.name}; complete_rows=${dataset.rowCount};\\n${String(dataset.summary ?? "No persisted summary is available.")}`);
  const value = [...datasets.map(dataset => `DATASET: ${dataset.name}; rows=${dataset.rowCount}; fields=${JSON.stringify(dataset.schema)}`), ...datasetSummaries, definitions.map(definition => `${definition.kind.toUpperCase()}: ${definition.name} — ${definition.description}; expression=${definition.expression}; aliases=${(definition.aliases ?? []).join(", ")}`).join("\\n")].filter(Boolean).join("\\n\\n");
  catalogCache = { value, expiresAt: Date.now() + 30_000 };
  return value;
}

async function findRelevantDatasetDocuments(question: string) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.collection("datasetDocuments").find({ $text: { $search: question } }, { projection: { text: 1, row: 1 } }).sort({ score: { $meta: "textScore" } }).limit(40).toArray();
  } catch {
    return db.collection("datasetDocuments").find({}, { projection: { text: 1, row: 1 } }).sort({ createdAt: -1 }).limit(120).toArray();
  }
}

export async function answerBusinessQuestion(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>, otherChatsContext?: string) {
  const lastQuestion = [...messages].reverse().find(message => message.role === "user")?.content?.trim();
  if (!lastQuestion) throw new Error("A user question is required.");
    const quickReply = /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|help|what can you do)[!.? ]*$/i.test(lastQuestion);
  if (quickReply) return lastQuestion.toLowerCase().startsWith("thank") ? "You’re welcome. Upload a business or finance file whenever you’re ready, and I’ll help you explore or explain it." : "Hello. I can analyze uploaded business and finance data, explain terminology, and answer grounded questions in normal language. Upload a file or ask me anything to get started.";

  const db = await getDb();
  
  // Align RAG properly by including previous conversational context
  const searchContext = messages.map(m => m.content).slice(-4).join("\n");
  
  const [catalogContext, datasetDocs, unstructuredDocs, kgContext] = await Promise.all([
    getCatalogContext(),
    db ? findRelevantDatasetDocuments(searchContext) : Promise.resolve([]),
    db ? queryUnstructuredDocuments(searchContext, 5) : Promise.resolve([]),
    db ? searchKnowledgeGraph(searchContext) : Promise.resolve([])
  ]);
  const retrieved = retrieveRows(searchContext, datasetDocs.map(document => ({ text: String(document.text), row: document.row as Row })));
  const documentContext = unstructuredDocs.join("\n");
  const rowContext = retrieved.map(document => document.text).join("\n");
  const kgContextString = typeof kgContext !== "undefined" ? kgContext.map((edge: any) => `${edge.source} -> ${edge.relation} -> ${edge.target}`).join("\n") : "";
  const executionContext = typeof kgContext !== "undefined" ? await generateAndExecuteMql(searchContext, catalogContext, kgContextString) : "";
  
  const context = [
    catalogContext, 
    rowContext, 
    documentContext ? `DOCUMENT CONTEXT:\n${documentContext}` : "",
    `KNOWLEDGE GRAPH:\n${kgContextString}`,
    `DATABASE EXECUTION RESULT:\n${executionContext}`
  ].filter(Boolean).join("\n\n");
  const system = `You are the Semantic Layer business and finance assistant. Answer in clear normal language, not SQL, JSON, or code. Use only the supplied governed catalog and retrieved dataset context for claims about uploaded data. Never invent figures, entities, dates, formulas, or financial conclusions. If the context is insufficient, say exactly what is missing and ask one concise clarification question. Explain business or finance terms whenever the user asks what a term means. For calculations, show the assumptions and say when a result is an estimate. Treat generated definitions as pending review and mention that limitation for material decisions. General conversation is allowed, but business/data answers must stay grounded. When the user asks about or clarifies a specific entity (like a sale or customer), provide comprehensive details about it from the retrieved context instead of just confirming its existence.

${otherChatsContext ? `PAST CHAT HISTORY CONTEXT (Use for reference if the user refers to past conversations):\n${otherChatsContext}\n\n` : "" }GOVERNED CONTEXT:
${context || "No dataset has been uploaded yet."}`;
  const response = await invokeLLM({
    messages: [
      { role: "system", content: system },
      ...messages.filter(message => message.role !== "system"),
    ],
    
  });
  const content = response.choices[0]?.message.content;
  return typeof content === "string" ? content : "I could not produce a grounded answer. Please rephrase the question.";
}

import { streamLLM } from "./_core/llm.js";

export async function* streamBusinessQuestion(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>, otherChatsContext?: string): AsyncGenerator<string, void, unknown> {
  const lastQuestion = [...messages].reverse().find(message => message.role === "user")?.content?.trim();
  if (!lastQuestion) throw new Error("A user question is required.");
  
  const quickReply = /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|help|what can you do)[!.? ]*$/i.test(lastQuestion);
  if (quickReply) {
    yield lastQuestion.toLowerCase().startsWith("thank") ? "You're welcome. Upload a business or finance file whenever you're ready, and I'll help you explore or explain it." : "Hello. I can analyze uploaded business and finance data, explain terminology, and answer grounded questions in normal language. Upload a file or ask me anything to get started.";
    return;
  }

  const db = await getDb();
  
  const searchContext = messages.map(m => m.content).slice(-4).join("\n");
  
  const [catalogContext, datasetDocs, unstructuredDocs, kgContext] = await Promise.all([
    getCatalogContext(),
    db ? findRelevantDatasetDocuments(searchContext) : Promise.resolve([]),
    db ? queryUnstructuredDocuments(searchContext, 5) : Promise.resolve([]),
    db ? searchKnowledgeGraph(searchContext) : Promise.resolve([])
  ]);
  
  const retrieved = retrieveRows(searchContext, datasetDocs.map(document => ({ text: String(document.text), row: document.row as any })));
  const documentContext = unstructuredDocs.join("\n");
  const rowContext = retrieved.map(document => document.text).join("\n");
  const kgContextString = typeof kgContext !== "undefined" ? kgContext.map((edge: any) => `${edge.source} -> ${edge.relation} -> ${edge.target}`).join("\n") : "";
  const executionContext = typeof kgContext !== "undefined" ? await generateAndExecuteMql(searchContext, catalogContext, kgContextString) : "";
  
  const context = [
    catalogContext, 
    rowContext, 
    documentContext ? `DOCUMENT CONTEXT:\n${documentContext}` : "",
    `KNOWLEDGE GRAPH:\n${kgContextString}`,
    `DATABASE EXECUTION RESULT:\n${executionContext}`
  ].filter(Boolean).join("\n\n");
  
  const system = `You are the Semantic Layer business and finance assistant. Answer in clear normal language, not SQL, JSON, or code. Use only the supplied governed catalog and retrieved dataset context for claims about uploaded data. Never invent figures, entities, dates, formulas, or financial conclusions. If the context is insufficient, say exactly what is missing and ask one concise clarification question. Explain business or finance terms whenever the user asks what a term means. For calculations, show the assumptions and say when a result is an estimate. Treat generated definitions as pending review and mention that limitation for material decisions. General conversation is allowed, but business/data answers must stay grounded. When the user asks about or clarifies a specific entity (like a sale or customer), provide comprehensive details about it from the retrieved context instead of just confirming its existence.

${otherChatsContext ? `PAST CHAT HISTORY CONTEXT (Use for reference if the user refers to past conversations):\n${otherChatsContext}\n\n` : "" }GOVERNED CONTEXT:
${context || "No dataset has been uploaded yet."}`;

  const stream = streamLLM({
    messages: [
      { role: "system", content: system },
      ...messages.filter(message => message.role !== "system"),
    ],
  });
  
  for await (const chunk of stream) {
    yield chunk;
  }
}
