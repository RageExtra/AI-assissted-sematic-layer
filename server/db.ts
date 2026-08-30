import { MongoClient, Db } from "mongodb";
import { User } from "./types";
import type { AlertPolicy, BenchmarkSchedule, DataSourceRecord, DefinitionEvent, EvaluationCase, EvaluationDataset, EvaluationRun, RegressionAlert, SemanticDefinition, StewardMember } from "../shared/governance";
import type { SemanticQueryRun } from "../shared/semantic";
import { ENV } from "./_core/env";

let _client: MongoClient | null = null;
let _db: Db | null = null;

export async function getMongoClient() {
  if (!_client && process.env.MONGODB_URI) {
    try {
      _client = new MongoClient(process.env.MONGODB_URI);
      await _client.connect();
      _db = _client.db(); // Uses the default DB in connection string
    } catch (error) {
      console.warn("[Database] Failed to connect to MongoDB:", error);
    }
  }
  return _client;
}

export async function getDb(): Promise<Db | null> {
  await getMongoClient();
  return _db;
}

// Generate a numeric ID (since frontend expects number for most IDs)
function generateId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

export async function upsertUser(user: Partial<User> & { openId: string }): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  
  const existing = await db.collection("users").findOne({ openId: user.openId });
  const role = "admin";
  const stewardRole = "approver";

  if (existing) {
    await db.collection("users").updateOne({ openId: user.openId }, {
      $set: {
        name: user.name ?? existing.name,
        email: user.email ?? existing.email,
        loginMethod: user.loginMethod ?? existing.loginMethod,
        lastSignedIn: user.lastSignedIn ?? new Date(),
        role,
        stewardRole
      }
    });
  } else {
    await db.collection("users").insertOne({
      id: generateId(),
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      lastSignedIn: user.lastSignedIn ?? new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      role,
      stewardRole
    });
  }
}

export async function getUserByOpenId(openId: string): Promise<any | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const doc = await db.collection("users").findOne({ openId });
  if (!doc) return undefined;
  delete (doc as any)._id;
  return doc;
}

export async function saveQueryRun(run: SemanticQueryRun) {
  const db = await getDb();
  if (db) await db.collection("queryRuns").insertOne({ ...run, _id: run.id as any });
}

export async function listQueryRuns(limit = 8): Promise<SemanticQueryRun[]> {
  const db = await getDb();
  if (!db) return [];
  const runs = await db.collection("queryRuns").find().sort({ createdAt: -1 }).limit(limit).toArray();
  return runs.map(r => {
    const { _id, ...rest } = r;
    return rest as unknown as SemanticQueryRun;
  });
}

export async function saveQueryFeedback(input: { runId: string; rating: "helpful" | "needs_review"; note?: string }) {
  const db = await getDb();
  if (db) await db.collection("queryFeedback").insertOne({
    id: generateId(),
    runId: input.runId,
    rating: input.rating,
    note: input.note?.slice(0, 500) ?? null,
    createdAt: new Date()
  });
}

export async function ensureGovernanceSeeds(
  definitions: Omit<SemanticDefinition, "id" | "updatedAt">[], 
  datasets: Omit<EvaluationDataset, "id">[], 
  cases: Array<{ datasetName: string; question: string; expectedIntent: string; requiredMetric: string; requiredDimension: string; baselinePass: boolean }>
) {
  const db = await getDb();
  if (!db) return;
  
  const defCount = await db.collection("semanticDefinitions").countDocuments();
  if (defCount === 0) {
    const toInsert = definitions.map(d => ({ ...d, id: generateId(), updatedAt: new Date().toISOString() }));
    await db.collection("semanticDefinitions").insertMany(toInsert);
    
    const events = toInsert.map(item => ({
      id: generateId(),
      definitionId: item.id,
      eventType: "created" as const,
      version: item.version,
      rationale: item.rationale,
      createdAt: new Date().toISOString()
    }));
    await db.collection("definitionEvents").insertMany(events);
  }

  const dsCount = await db.collection("evaluationDatasets").countDocuments();
  let seededDatasets: any[] = [];
  if (dsCount === 0) {
    seededDatasets = datasets.map(d => ({ ...d, id: generateId() }));
    await db.collection("evaluationDatasets").insertMany(seededDatasets);
  } else {
    seededDatasets = await db.collection("evaluationDatasets").find().toArray();
  }

  const caseCount = await db.collection("evaluationCases").countDocuments();
  if (caseCount === 0) {
    const caseDocs = cases.map(item => {
      const datasetId = seededDatasets.find(d => d.name === item.datasetName)?.id;
      return {
        id: generateId(),
        ...item,
        datasetId,
        baselinePass: item.baselinePass ? 1 : 0
      };
    });
    // Remove datasetName from doc
    caseDocs.forEach((d: any) => delete d.datasetName);
    await db.collection("evaluationCases").insertMany(caseDocs);
  }
}

export async function listDataSources(): Promise<DataSourceRecord[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("dataSources").find().sort({ createdAt: -1 }).toArray()) as any;
}

export async function createDataSource(input: Omit<DataSourceRecord, "id" | "createdAt">): Promise<DataSourceRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const doc = { ...input, id: generateId(), createdAt: new Date().toISOString() };
  await db.collection("dataSources").insertOne(doc);
  return doc as any;
}

export async function getDataSource(id: number): Promise<DataSourceRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const doc = await db.collection("dataSources").findOne({ id });
  return doc ? (doc as any) : undefined;
}

export async function updateDataSource(id: number, input: Partial<Pick<DataSourceRecord, "connectionState" | "discovery">>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.collection("dataSources").updateOne({ id }, { $set: input });
  const row = await getDataSource(id);
  if (!row) throw new Error("Datasource was not found");
  return row;
}

export async function listDefinitions(): Promise<SemanticDefinition[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("semanticDefinitions").find().sort({ updatedAt: -1 }).toArray()).map((r: any) => {
    delete r._id;
    return r as SemanticDefinition;
  });
}

export async function createDefinition(input: Omit<SemanticDefinition, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date().toISOString();
  await db.collection("semanticDefinitions").insertOne({ ...input, id: generateId(), createdAt: now, updatedAt: now });
}

export async function updateDefinition(id: number, input: { description?: string; expression?: string; aliases?: string[]; rationale?: string; status?: SemanticDefinition["status"]; versionIncrement?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const current = await db.collection("semanticDefinitions").findOne({ id });
  if (!current) throw new Error("Definition was not found");
  
  const version = (current.version || 1) + (input.versionIncrement ?? 0);
  const eventType = input.status === "approved" ? "approved" : "edited";
  const now = new Date().toISOString();

  await db.collection("semanticDefinitions").updateOne({ id }, {
    $set: {
      description: input.description ?? current.description,
      expression: input.expression ?? current.expression,
      aliases: input.aliases ?? current.aliases,
      rationale: input.rationale ?? current.rationale,
      status: input.status ?? current.status,
      version,
      updatedAt: now
    }
  });

  await db.collection("definitionEvents").insertOne({
    id: generateId(),
    definitionId: id,
    eventType,
    version,
    rationale: input.rationale ?? current.rationale,
    createdAt: now
  });

  return (await db.collection("semanticDefinitions").findOne({ id })) as unknown as SemanticDefinition;
}

export async function listDefinitionEvents(definitionId: number): Promise<DefinitionEvent[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("definitionEvents").find({ definitionId }).sort({ createdAt: -1 }).toArray()).map(r => { delete (r as any)._id; return r as any; });
}

export async function listEvaluationDatasets(): Promise<EvaluationDataset[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("evaluationDatasets").find().toArray()).map(r => { delete (r as any)._id; return r as any; });
}

export async function getEvaluationDataset(id: number): Promise<EvaluationDataset | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.collection("evaluationDatasets").findOne({ id });
  if (res) delete (res as any)._id;
  return res as any;
}

export async function listEvaluationCases(datasetId: number): Promise<EvaluationCase[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("evaluationCases").find({ datasetId }).toArray()).map((row: any) => {
    delete row._id;
    return { ...row, baselinePass: Boolean(row.baselinePass) };
  });
}

export async function createEvaluationDatasetWithCases(input: Omit<EvaluationDataset, "id">, cases: Array<Omit<EvaluationCase, "id" | "datasetId">>): Promise<EvaluationDataset> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const datasetId = generateId();
  const datasetDoc = { ...input, id: datasetId };
  await db.collection("evaluationDatasets").insertOne(datasetDoc);
  
  const caseDocs = cases.map(item => ({
    id: generateId(),
    ...item,
    datasetId,
    baselinePass: item.baselinePass ? 1 : 0
  }));
  await db.collection("evaluationCases").insertMany(caseDocs);
  return datasetDoc as any;
}

export async function listEvaluationRuns(): Promise<EvaluationRun[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("evaluationRuns").find().sort({ createdAt: -1 }).toArray()).map((row: any) => {
    delete row._id;
    return {
      ...row,
      scheduleId: row.scheduleId ?? null,
      semanticScore: Number(row.semanticScore),
      baselineScore: Number(row.baselineScore),
      groundingRate: Number(row.groundingRate),
      safetyRate: Number(row.safetyRate),
      reproducibilityRate: Number(row.reproducibilityRate)
    };
  });
}

export async function listEvaluationTrends(): Promise<EvaluationRun[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("evaluationRuns").find().sort({ createdAt: 1 }).toArray()).map((row: any) => {
    delete row._id;
    return {
      ...row,
      semanticScore: Number(row.semanticScore),
      baselineScore: Number(row.baselineScore),
      groundingRate: Number(row.groundingRate),
      safetyRate: Number(row.safetyRate),
      reproducibilityRate: Number(row.reproducibilityRate)
    };
  });
}

export async function createEvaluationRun(input: Omit<EvaluationRun, "id" | "createdAt">): Promise<EvaluationRun> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const doc = {
    ...input,
    id: generateId(),
    scheduleId: input.scheduleId ?? null,
    createdAt: new Date().toISOString()
  };
  await db.collection("evaluationRuns").insertOne(doc);
  const result = { ...doc };
  delete (result as any)._id;
  return result as any;
}

export async function listEvaluationRunsForSchedule(scheduleId: number): Promise<EvaluationRun[]> {
  return (await listEvaluationRuns()).filter(run => run.scheduleId === scheduleId);
}

export async function listStewardMembers(): Promise<StewardMember[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("users").find().sort({ lastSignedIn: -1 }).toArray()).map((row: any) => {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      stewardRole: row.role === "admin" ? "approver" : row.stewardRole,
      lastSignedIn: new Date(row.lastSignedIn).toISOString()
    };
  });
}

export async function assignStewardRole(id: number, stewardRole: StewardMember["stewardRole"]): Promise<StewardMember> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.collection("users").updateOne({ id }, { $set: { stewardRole } });
  const member = (await listStewardMembers()).find(item => item.id === id);
  if (!member) throw new Error("Workspace member was not found");
  return member;
}

const scheduleRecord = (row: any): BenchmarkSchedule => {
  delete row._id;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    scheduleCronTaskUid: row.scheduleCronTaskUid ?? null,
    lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
    nextRunAt: row.nextRunAt ? new Date(row.nextRunAt).toISOString() : null,
  };
};

export async function listBenchmarkSchedules(): Promise<BenchmarkSchedule[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("benchmarkSchedules").find().sort({ createdAt: -1 }).toArray()).map(scheduleRecord);
}

export async function getBenchmarkSchedule(id: number): Promise<BenchmarkSchedule | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const row = await db.collection("benchmarkSchedules").findOne({ id });
  return row ? scheduleRecord(row) : undefined;
}

export async function getBenchmarkScheduleByTaskUid(taskUid: string): Promise<BenchmarkSchedule | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const row = await db.collection("benchmarkSchedules").findOne({ scheduleCronTaskUid: taskUid });
  return row ? scheduleRecord(row) : undefined;
}

export async function createBenchmarkSchedule(input: Omit<BenchmarkSchedule, "id" | "enabled" | "scheduleCronTaskUid" | "lastRunAt" | "nextRunAt" | "createdAt">): Promise<BenchmarkSchedule> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const doc = { ...input, id: generateId(), enabled: false, scheduleCronTaskUid: null, lastRunAt: null, nextRunAt: null, createdAt: new Date().toISOString() };
  await db.collection("benchmarkSchedules").insertOne(doc);
  return scheduleRecord(doc);
}

export async function activateBenchmarkSchedule(id: number, taskUid: string, nextRunAt?: string | null): Promise<BenchmarkSchedule> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.collection("benchmarkSchedules").updateOne({ id }, {
    $set: { enabled: true, scheduleCronTaskUid: taskUid, nextRunAt: nextRunAt ? new Date(nextRunAt) : null }
  });
  return (await getBenchmarkSchedule(id))!;
}

export async function updateScheduleExecution(id: number, nextRunAt?: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.collection("benchmarkSchedules").updateOne({ id }, {
    $set: { lastRunAt: new Date(), nextRunAt: nextRunAt ? new Date(nextRunAt) : null }
  });
}

export async function ensureAlertPolicy(): Promise<AlertPolicy> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.collection("alertPolicies").findOne();
  if (existing) {
    delete (existing as any)._id;
    return {
      ...existing,
      safetyThreshold: Number(existing.safetyThreshold),
      groundingThreshold: Number(existing.groundingThreshold),
      enabled: Boolean(existing.enabled)
    } as any;
  }
  
  const doc = { id: generateId(), safetyThreshold: "0.95", groundingThreshold: "0.90", enabled: 1, updatedAt: new Date().toISOString() };
  await db.collection("alertPolicies").insertOne(doc);
  return { ...doc, safetyThreshold: Number(doc.safetyThreshold), groundingThreshold: Number(doc.groundingThreshold), enabled: Boolean(doc.enabled) } as any;
}

export async function updateAlertPolicy(input: Pick<AlertPolicy, "safetyThreshold" | "groundingThreshold" | "enabled">): Promise<AlertPolicy> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const current = await ensureAlertPolicy();
  await db.collection("alertPolicies").updateOne({ id: current.id }, {
    $set: {
      safetyThreshold: String(input.safetyThreshold),
      groundingThreshold: String(input.groundingThreshold),
      enabled: input.enabled ? 1 : 0,
      updatedAt: new Date().toISOString()
    }
  });
  return ensureAlertPolicy();
}

export async function createRegressionAlerts(input: Array<Omit<RegressionAlert, "id" | "createdAt" | "status">>): Promise<void> {
  const db = await getDb();
  if (!db || !input.length) return;
  const docs = input.map(item => ({
    id: generateId(),
    ...item,
    scheduleId: item.scheduleId ?? undefined,
    observedValue: String(item.observedValue),
    thresholdValue: String(item.thresholdValue),
    status: "open" as const,
    createdAt: new Date().toISOString()
  }));
  await db.collection("regressionAlerts").insertMany(docs);
}

export async function listRegressionAlerts(): Promise<RegressionAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.collection("regressionAlerts").find().sort({ createdAt: -1 }).toArray()).map((row: any) => {
    delete row._id;
    return {
      ...row,
      scheduleId: row.scheduleId ?? null,
      observedValue: Number(row.observedValue),
      thresholdValue: Number(row.thresholdValue)
    };
  });
}

export async function acknowledgeRegressionAlert(id: number): Promise<RegressionAlert> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.collection("regressionAlerts").updateOne({ id }, { $set: { status: "acknowledged" } });
  const row = await db.collection("regressionAlerts").findOne({ id });
  if (!row) throw new Error("Alert was not found");
  delete (row as any)._id;
  return {
    ...row,
    scheduleId: row.scheduleId ?? null,
    observedValue: Number(row.observedValue),
    thresholdValue: Number(row.thresholdValue)
  } as any;
}

export async function createCollection(name: string, schema?: object, indexes?: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  try {
    if (schema) {
      await db.createCollection(name, { validator: { $jsonSchema: schema } });
    } else {
      await db.createCollection(name);
    }
    
    if (indexes && indexes.length > 0) {
      for (const idx of indexes) {
        await db.collection(name).createIndex(idx.key, idx.options);
      }
    }
  } catch (err: any) {
    if (err.codeName === 'NamespaceExists') {
      if (schema) {
        await db.command({ collMod: name, validator: { $jsonSchema: schema } });
      }
    } else {
      throw err;
    }
  }
}

export async function getRelevantDefinitions(question: string): Promise<SemanticDefinition[]> {
  const all = await listDefinitions();
  const q = question.toLowerCase();
  
  // Lightweight Hybrid RAG keyword filtering
  // If no specific keywords match, we return a core subset to prevent context bloat
  const filtered = all.filter(def => {
    const term = def.term.toLowerCase();
    const desc = def.description.toLowerCase();
    
    // Split question into words and check if any significant word matches
    const words = q.split(/\W+/).filter(w => w.length > 3);
    const matches = words.some(w => term.includes(w) || desc.includes(w));
    
    return matches || term.includes("revenue") || term.includes("customer"); 
  });
  
  return filtered.length > 0 ? filtered : all.slice(0, 5);
}

export async function createDraftDefinition(term: string, description: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.collection("draftDefinitions").insertOne({
    id: generateId(),
    term,
    description,
    status: "pending",
    createdAt: new Date().toISOString()
  });
}
