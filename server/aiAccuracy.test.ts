import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { compileASTtoMQL } from "./mqlCompiler.js";
import { validateMQL } from "./mqlValidator.js";
import {
  buildSemanticQuery,
  validateReadOnlySql,
  handleDocumentUpload,
  queryUnstructuredDocuments,
} from "./semanticEngine.js";
import {
  answerBusinessQuestion,
  streamBusinessQuestion,
  queueDatasetIngestion,
  getDatasetJob,
} from "./datasetEngine.js";
import {
  getDb,
  listDefinitions,
  createDefinition,
  getRelevantDefinitions,
  createCollection,
} from "./db.js";
import { validateInterpretation } from "./validation.js";
import { cosineSimilarity, generateEmbedding } from "./_core/vector.js";
import type { SemanticDefinition } from "../shared/governance.js";

// ==============================================================================
// AI Accuracy Benchmark & E2E Automated Test Suite (Milestone M4)
//
// Structured systematically across four key evaluation tiers:
//   Tier 1: Grounding, Citations & Intent Resolution
//   Tier 2: Multi-Turn Conversation & Disambiguation Gating
//   Tier 3: Dynamic MQL Compilation & Live Database Arithmetic
//   Tier 4: Pipeline Reliability, Error Recovery & Security
// ==============================================================================

describe("Milestone M4: AI Accuracy & Pipeline Reliability Benchmark Suite", () => {
  const standardDefinitions: SemanticDefinition[] = [
    {
      id: 101,
      kind: "metric",
      name: "Completed Revenue",
      description: "Recognized order value excluding refunds and pending orders.",
      expression: "SUM(orders.amount) WHERE orders.order_status = 'completed'",
      aliases: ["revenue", "sales", "completed revenue", "turnover"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 102,
      kind: "metric",
      name: "Gross Merchandise Value",
      description: "Total transaction value across all placed orders before deductions.",
      expression: "SUM(orders.amount)",
      aliases: ["gmv", "gross revenue", "total gmv"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 103,
      kind: "metric",
      name: "Customer Acquisition Cost",
      description: "Average cost invested to acquire a new paying customer.",
      expression: "SUM(marketing.spend) / COUNT(customers.customer_id)",
      aliases: ["cac", "acquisition cost", "blended cac"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 104,
      kind: "metric",
      name: "Average Order Value",
      description: "Mean dollar value generated per order transaction.",
      expression: "AVG(orders.amount)",
      aliases: ["aov", "average basket", "ticket size"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 105,
      kind: "metric",
      name: "Customer Churn Rate",
      description: "Percentage of active customers who discontinued service over observation period.",
      expression: "COUNT(churned.customer_id) / COUNT(active.customer_id)",
      aliases: ["churn", "attrition rate", "customer churn"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 106,
      kind: "dimension",
      name: "Customer Region",
      description: "Commercial geographic territory associated with the customer profile.",
      expression: "customers.region",
      aliases: ["region", "territory", "geo"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 107,
      kind: "dimension",
      name: "Customer",
      description: "Master legal customer entity identifier and trading name.",
      expression: "customers.customer_name",
      aliases: ["buyer", "client", "customer name", "account"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 108,
      kind: "dimension",
      name: "Month",
      description: "Standard calendar month timestamp grain.",
      expression: "orders.order_date",
      aliases: ["monthly", "calendar month", "month grain"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 109,
      kind: "relationship",
      name: "Customer places Order",
      description: "Governed one-to-many relationship join linking customers to orders.",
      expression: "customers.customer_id = orders.customer_id",
      aliases: ["customer orders", "order customer join"],
      evidence: [],
      status: "approved",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Seed semanticDefinitions collection with standard definitions
    for (const def of standardDefinitions) {
      const { id, createdAt, updatedAt, ...rest } = def;
      await createDefinition(rest as any);
    }
  });

  // ==============================================================================
  // TIER 1: Grounding, Citations & Intent Resolution
  // ==============================================================================
  describe("Tier 1: Grounding, Citations & Intent Resolution", () => {
    it("formats and parses structured bracket citation tags for uploaded unstructured documents", async () => {
      const docName = "Q3_Expense_Policy.txt";
      const docContent =
        "All software and cloud infrastructure purchases exceeding $500 require departmental VP authorization.";
      const base64Data = Buffer.from(docContent, "utf8").toString("base64");

      const uploadResult = await handleDocumentUpload(docName, "text/plain", base64Data);
      expect(uploadResult.success).toBe(true);
      expect(uploadResult.chunksGenerated).toBeGreaterThan(0);

      // Query the unstructured document store
      const retrieved = await queryUnstructuredDocuments("software purchases VP authorization threshold", 2);
      expect(retrieved.length).toBeGreaterThan(0);

      const snippet = retrieved[0];
      // Must contain exact bracket citation tag: [Document: <name>]
      expect(snippet).toContain(`[Document: ${docName}]`);
      expect(snippet).toContain("departmental VP authorization");
    });

    it("formats tabular row snippets and schema context with [Dataset: <name>] citation tags", async () => {
      const sampleRows = [
        { customer_id: "C-100", territory: "North America", invoice_amount: 4500 },
        { customer_id: "C-101", territory: "EMEA", invoice_amount: 8200 },
      ];

      const job = await queueDatasetIngestion("Q3 Regional Invoices.csv", sampleRows);
      expect(job.jobId).toBeDefined();

      // Poll briefly for in-memory completion
      let status = job.status;
      let finalJob = await getDatasetJob(job.jobId);
      for (let i = 0; i < 20 && status !== "ready" && status !== "failed"; i++) {
        await new Promise((r) => setTimeout(r, 50));
        finalJob = await getDatasetJob(job.jobId);
        if (finalJob) status = finalJob.status;
      }

      expect(finalJob?.status).toBe("ready");
      expect(finalJob?.result?.success).toBe(true);

      const db = await getDb();
      expect(db).toBeDefined();
      if (db) {
        const datasetDocs = await db
          .collection("datasetDocuments")
          .find({ datasetName: "Q3 Regional Invoices" })
          .toArray();

        expect(datasetDocs.length).toBe(2);
        for (const doc of datasetDocs) {
          expect(doc.text).toMatch(/^\[Dataset: Q3 Regional Invoices\]/);
          expect(doc.text).toContain("Territory:");
          expect(doc.text).toContain("Invoice Amount:");
        }
      }
    });

    it("resolves business aliases and short acronyms (GMV, CAC, AOV, churn, monthly revenue) accurately", async () => {
      // 1. GMV Acronym
      const gmvDefs = await getRelevantDefinitions("What was our GMV in Q3?");
      expect(gmvDefs.length).toBeGreaterThan(0);
      expect(gmvDefs[0].name).toBe("Gross Merchandise Value");
      expect(gmvDefs[0].aliases).toContain("gmv");

      // 2. CAC Acronym
      const cacDefs = await getRelevantDefinitions("How do we measure CAC across marketing channels?");
      expect(cacDefs.length).toBeGreaterThan(0);
      expect(cacDefs[0].name).toBe("Customer Acquisition Cost");
      expect(cacDefs[0].aliases).toContain("cac");

      // 3. AOV Acronym
      const aovDefs = await getRelevantDefinitions("Calculate the AOV for holiday sales");
      expect(aovDefs.length).toBeGreaterThan(0);
      expect(aovDefs[0].name).toBe("Average Order Value");
      expect(aovDefs[0].aliases).toContain("aov");

      // 4. Churn Keyword
      const churnDefs = await getRelevantDefinitions("What is our monthly customer churn rate?");
      expect(churnDefs.length).toBeGreaterThan(0);
      expect(churnDefs[0].name).toBe("Customer Churn Rate");

      // 5. Monthly Revenue Keyword
      const revDefs = await getRelevantDefinitions("Show monthly revenue trends");
      expect(revDefs.length).toBeGreaterThan(0);
      expect(revDefs.some((d) => d.name === "Completed Revenue" || d.name === "Month")).toBe(true);
    });

    it("ranks exact alias and token matches above broad description overlaps", async () => {
      const defs = await getRelevantDefinitions("CAC");
      expect(defs[0].name).toBe("Customer Acquisition Cost");

      const gmvMatches = await getRelevantDefinitions("gross merchandise volume");
      expect(gmvMatches[0].name).toBe("Gross Merchandise Value");
    });

    it("filters and distinguishes definitions by governance status (approved vs pending_review vs draft)", async () => {
      const db = await getDb();
      if (!db) return;

      await createDefinition({
        kind: "metric",
        name: "Pending Experimental Score",
        description: "Experimental lead score under review",
        expression: "AVG(leads.score)",
        aliases: ["lead score"],
        evidence: [],
        status: "pending_review",
        version: 1,
        rationale: "Testing evaluation status",
      });

      const allDefs = await listDefinitions();
      const approvedCount = allDefs.filter((d) => d.status === "approved").length;
      const pendingCount = allDefs.filter((d) => d.status === "pending_review").length;

      expect(approvedCount).toBeGreaterThan(0);
      expect(pendingCount).toBeGreaterThan(0);

      const pendingDef = allDefs.find((d) => d.name === "Pending Experimental Score");
      expect(pendingDef).toBeDefined();
      expect(pendingDef?.status).toBe("pending_review");
    });
  });

  // ==============================================================================
  // TIER 2: Multi-Turn Conversation & Disambiguation Gating
  // ==============================================================================
  describe("Tier 2: Multi-Turn Conversation & Disambiguation Gating", () => {
    it("constructs multi-turn conversational history context across successive user/assistant turns", async () => {
      const conversation = [
        { role: "user" as const, content: "What is our company expense policy?" },
        {
          role: "assistant" as const,
          content: "The Q3 Expense Policy requires VP approval for expenses exceeding $500.",
        },
        { role: "user" as const, content: "Does that threshold apply to software and cloud purchases?" },
      ];

      // Run answerBusinessQuestion with full multi-turn context
      const answer = await answerBusinessQuestion(conversation);
      expect(typeof answer).toBe("string");
      expect(answer.length).toBeGreaterThan(0);
    });

    it("proactively detects underspecified queries and gates execution with clarification_required", async () => {
      const underspecifiedQueries = [
        "give me an overview of company performance",
        "show business health",
        "provide recent insights",
        "tell me about our performance metrics",
      ];

      for (const query of underspecifiedQueries) {
        const run = await buildSemanticQuery(query, false, false);

        // Ambiguity Gate Assertions
        expect(run.ambiguity.detected).toBe(true);
        expect(run.safety.status).toBe("clarification_required");
        expect(run.sql).toBe("");
        expect(run.metric).toBe("Unresolved");
        expect(run.dimension).toBe("Unresolved");
        expect(run.result.rows).toEqual([]);
        expect(run.ambiguity.questions.length).toBeGreaterThan(0);
        expect(run.ambiguity.questions).toEqual(
          expect.arrayContaining([
            "Show completed revenue by region",
            "Show completed revenue by month",
            "Show top customers by completed revenue",
          ])
        );
      }
    });

    it("routes conversational greetings and acknowledgments via quickReply fast path without DB queries", async () => {
      const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "help", "what can you do"];
      for (const greeting of greetings) {
        const response = await answerBusinessQuestion([{ role: "user", content: greeting }]);
        expect(response).toContain("Hello. I can analyze uploaded business and finance data");
        expect(response).not.toContain("<think>");
      }

      const thanks = ["thanks", "thank you", "thanks!"];
      for (const thank of thanks) {
        const response = await answerBusinessQuestion([{ role: "user", content: thank }]);
        expect(response).toContain("You're welcome");
      }

      // Stream version fast path
      const streamGen = streamBusinessQuestion([{ role: "user", content: "hello" }]);
      const chunks: string[] = [];
      for await (const chunk of streamGen) {
        chunks.push(chunk);
      }
      expect(chunks.join("")).toContain("Hello! I can analyze uploaded business and finance data");
    });
  });

  // ==============================================================================
  // TIER 3: Dynamic MQL Compilation & Live Database Arithmetic
  // ==============================================================================
  describe("Tier 3: Dynamic MQL Compilation & Live Database Arithmetic", () => {
    beforeAll(async () => {
      const db = await getDb();
      if (!db) return;

      // Clean and seed live collections for live in-memory MongoDB arithmetic tests
      await db.collection("orders").deleteMany({});
      await db.collection("customers").deleteMany({});

      await db.collection("customers").insertMany([
        { customerId: "C1", customerName: "Acme Corp", region: "North America" },
        { customerId: "C2", customerName: "Beta Global", region: "EMEA" },
        { customerId: "C3", customerName: "Gamma Enterprises", region: "North America" },
        { customerId: "C4", customerName: "Delta Retail", region: "APAC" },
      ]);

      await db.collection("orders").insertMany([
        { orderId: "O1", customerId: "C1", amount: 100, orderStatus: "completed", orderDate: "2026-01-15T10:00:00Z" },
        { orderId: "O2", customerId: "C1", amount: 200, orderStatus: "completed", orderDate: "2026-01-22T14:30:00Z" },
        { orderId: "O3", customerId: "C2", amount: 300, orderStatus: "completed", orderDate: "2026-02-05T09:15:00Z" },
        { orderId: "O4", customerId: "C3", amount: 150, orderStatus: "completed", orderDate: "2026-02-18T16:45:00Z" },
        { orderId: "O5", customerId: "C4", amount: 250, orderStatus: "completed", orderDate: "2026-03-02T11:20:00Z" },
        // Refunded & Pending orders must be excluded by WHERE orders.order_status = 'completed'
        { orderId: "O6", customerId: "C2", amount: 500, orderStatus: "refunded", orderDate: "2026-02-10T12:00:00Z" },
        { orderId: "O7", customerId: "C1", amount: 80, orderStatus: "pending", orderDate: "2026-03-05T08:00:00Z" },
      ]);
    });

    it("compiles dynamic MQL for SUM, AVG, COUNT, MIN, MAX aggregation operators", () => {
      const ops = [
        { kind: "metric", name: "Sum Test", expression: "SUM(orders.amount)" },
        { kind: "metric", name: "Avg Test", expression: "AVG(orders.amount)" },
        { kind: "metric", name: "Count Test", expression: "COUNT(orders.order_id)" },
        { kind: "metric", name: "Min Test", expression: "MIN(orders.amount)" },
        { kind: "metric", name: "Max Test", expression: "MAX(orders.amount)" },
      ];

      for (const opDef of ops) {
        const compiled = compileASTtoMQL(opDef.name, undefined, [opDef]);
        expect(compiled.targetCollection).toBe("orders");
        expect(validateMQL(compiled.mql).ok).toBe(true);

        const groupStage = compiled.mql.find((s) => s.$group);
        expect(groupStage).toBeDefined();

        if (opDef.name === "Count Test") {
          expect(groupStage.$group.count_test).toEqual({ $sum: 1 });
        } else if (opDef.name === "Avg Test") {
          expect(groupStage.$group.avg_test).toEqual({ $avg: { $toDouble: "$amount" } });
        } else if (opDef.name === "Min Test") {
          expect(groupStage.$group.min_test).toEqual({ $min: { $toDouble: "$amount" } });
        } else if (opDef.name === "Max Test") {
          expect(groupStage.$group.max_test).toEqual({ $max: { $toDouble: "$amount" } });
        } else {
          expect(groupStage.$group.sum_test).toEqual({ $sum: { $toDouble: "$amount" } });
        }
      }
    });

    it("compiles Month dimension grain into UTC-safe $substrCP temporal projection", () => {
      const compiled = compileASTtoMQL("Completed Revenue", "Month", standardDefinitions);
      expect(compiled.columns).toEqual(["Month", "Revenue"]);

      // Month is on orders collection, so no cross-collection lookup is needed
      expect(compiled.mql.some((s) => s.$lookup)).toBe(false);

      const groupStage = compiled.mql.find((s) => s.$group);
      expect(groupStage.$group._id).toEqual({ $substrCP: ["$orderDate", 0, 7] });
      expect(validateMQL(compiled.mql).ok).toBe(true);
    });

    it("compiles cross-collection joins with $lookup and $unwind for dimensions across collections", () => {
      const compiled = compileASTtoMQL("Completed Revenue", "Customer Region", standardDefinitions);
      expect(compiled.columns).toEqual(["Region", "Revenue"]);

      const lookup = compiled.mql.find((s) => s.$lookup);
      expect(lookup).toBeDefined();
      expect(lookup.$lookup.from).toBe("customers");
      expect(lookup.$lookup.localField).toBe("customerId");
      expect(lookup.$lookup.foreignField).toBe("customerId");

      const unwind = compiled.mql.find((s) => s.$unwind);
      expect(unwind).toBeDefined();
      expect(unwind.$unwind).toBe("$customer");

      const group = compiled.mql.find((s) => s.$group);
      expect(group.$group._id).toBe("$customer.region");

      expect(validateMQL(compiled.mql).ok).toBe(true);
    });

    it("executes compiled MQL on live MongoDB and verifies exact arithmetic for Regional Revenue", async () => {
      const db = await getDb();
      expect(db).toBeDefined();
      if (!db) return;

      const compiled = compileASTtoMQL("Completed Revenue", "Customer Region", standardDefinitions);
      const rows = await db.collection(compiled.targetCollection).aggregate(compiled.mql).toArray();

      // Expected arithmetic:
      // North America (C1: 100+200, C3: 150) = 450
      // EMEA (C2: 300) = 300
      // APAC (C4: 250) = 250
      // O6 ($500 refunded) and O7 ($80 pending) are excluded
      expect(rows.length).toBe(3);

      const naRow = rows.find((r) => r.Region === "North America");
      expect(naRow).toBeDefined();
      expect(naRow?.Revenue).toBe(450);

      const emeaRow = rows.find((r) => r.Region === "EMEA");
      expect(emeaRow).toBeDefined();
      expect(emeaRow?.Revenue).toBe(300);

      const apacRow = rows.find((r) => r.Region === "APAC");
      expect(apacRow).toBeDefined();
      expect(apacRow?.Revenue).toBe(250);
    });

    it("executes compiled MQL on live MongoDB and verifies exact Monthly trend arithmetic", async () => {
      const db = await getDb();
      if (!db) return;

      const compiled = compileASTtoMQL("Completed Revenue", "Month", standardDefinitions);
      const rows = await db.collection(compiled.targetCollection).aggregate(compiled.mql).toArray();

      // Expected arithmetic:
      // 2026-01: O1(100) + O2(200) = 300
      // 2026-02: O3(300) + O4(150) = 450 (O6 refunded is excluded)
      // 2026-03: O5(250) = 250 (O7 pending is excluded)
      expect(rows.length).toBe(3);

      const jan = rows.find((r) => r.Month === "2026-01");
      expect(jan?.Revenue).toBe(300);

      const feb = rows.find((r) => r.Month === "2026-02");
      expect(feb?.Revenue).toBe(450);

      const mar = rows.find((r) => r.Month === "2026-03");
      expect(mar?.Revenue).toBe(250);
    });

    it("executes scalar aggregations on live MongoDB verifying SUM, AVG, COUNT, MIN, MAX math", async () => {
      const db = await getDb();
      if (!db) return;

      const mathDefs = [
        { kind: "metric", name: "Total Completed Rev", expression: "SUM(orders.amount) WHERE orders.order_status = 'completed'" },
        { kind: "metric", name: "Avg Completed Order", expression: "AVG(orders.amount) WHERE orders.order_status = 'completed'" },
        { kind: "metric", name: "Count Completed Orders", expression: "COUNT(orders.order_id) WHERE orders.order_status = 'completed'" },
        { kind: "metric", name: "Min Completed Order", expression: "MIN(orders.amount) WHERE orders.order_status = 'completed'" },
        { kind: "metric", name: "Max Completed Order", expression: "MAX(orders.amount) WHERE orders.order_status = 'completed'" },
      ];

      // 1. Total SUM: 100 + 200 + 300 + 150 + 250 = 1000
      const sumCompiled = compileASTtoMQL("Total Completed Rev", undefined, mathDefs);
      const sumRes = await db.collection(sumCompiled.targetCollection).aggregate(sumCompiled.mql).toArray();
      expect(sumRes[0]["Total Completed Rev"]).toBe(1000);

      // 2. AVG: 1000 / 5 = 200
      const avgCompiled = compileASTtoMQL("Avg Completed Order", undefined, mathDefs);
      const avgRes = await db.collection(avgCompiled.targetCollection).aggregate(avgCompiled.mql).toArray();
      expect(avgRes[0]["Avg Completed Order"]).toBe(200);

      // 3. COUNT: 5
      const countCompiled = compileASTtoMQL("Count Completed Orders", undefined, mathDefs);
      const countRes = await db.collection(countCompiled.targetCollection).aggregate(countCompiled.mql).toArray();
      expect(countRes[0]["Count Completed Orders"]).toBe(5);

      // 4. MIN: 100
      const minCompiled = compileASTtoMQL("Min Completed Order", undefined, mathDefs);
      const minRes = await db.collection(minCompiled.targetCollection).aggregate(minCompiled.mql).toArray();
      expect(minRes[0]["Min Completed Order"]).toBe(100);

      // 5. MAX: 300
      const maxCompiled = compileASTtoMQL("Max Completed Order", undefined, mathDefs);
      const maxRes = await db.collection(maxCompiled.targetCollection).aggregate(maxCompiled.mql).toArray();
      expect(maxRes[0]["Max Completed Order"]).toBe(300);
    });

    it("executes dynamic cross-collection relationship joins on custom uploaded dataset tables", async () => {
      const db = await getDb();
      if (!db) return;

      await db.collection("dataset_txns_2026").deleteMany({});
      await db.collection("dataset_buyers_2026").deleteMany({});

      await db.collection("dataset_buyers_2026").insertMany([
        { buyerId: "B-1", tier: "Enterprise" },
        { buyerId: "B-2", tier: "Mid-Market" },
      ]);

      await db.collection("dataset_txns_2026").insertMany([
        { txnId: "T-1", buyerId: "B-1", totalCost: 1200 },
        { txnId: "T-2", buyerId: "B-1", totalCost: 800 },
        { txnId: "T-3", buyerId: "B-2", totalCost: 500 },
      ]);

      const customDefs = [
        {
          kind: "metric",
          name: "Transactions · Total Cost",
          expression: "SUM(dataset_txns_2026.total_cost)",
        },
        {
          kind: "dimension",
          name: "Buyers · Loyalty Tier",
          expression: "dataset_buyers_2026.tier",
        },
        {
          kind: "relationship",
          name: "Txns to Buyers Link",
          expression: "dataset_txns_2026.buyer_id = dataset_buyers_2026.buyer_id",
        },
      ];

      const compiled = compileASTtoMQL("Transactions · Total Cost", "Buyers · Loyalty Tier", customDefs);
      expect(compiled.targetCollection).toBe("dataset_txns_2026");
      expect(compiled.columns).toEqual(["Loyalty Tier", "Total Cost"]);

      const rows = await db.collection(compiled.targetCollection).aggregate(compiled.mql).toArray();
      expect(rows.length).toBe(2);

      const entRow = rows.find((r) => r["Loyalty Tier"] === "Enterprise");
      expect(entRow?.["Total Cost"]).toBe(2000);

      const midRow = rows.find((r) => r["Loyalty Tier"] === "Mid-Market");
      expect(midRow?.["Total Cost"]).toBe(500);
    });
  });

  // ==============================================================================
  // TIER 4: Pipeline Reliability, Error Recovery & Security
  // ==============================================================================
  describe("Tier 4: Pipeline Reliability, Error Recovery & Security", () => {
    it("rejects unauthorized MQL stages ($out, $merge, $unionWith, $graphLookup, $facet)", () => {
      const attacks = [
        [{ $out: "dumped_collection" }],
        [{ $merge: { into: "users" } }],
        [{ $unionWith: { coll: "passwords" } }],
        [{ $graphLookup: { from: "users", startWith: "$id", connectFromField: "id", connectToField: "reportsTo", as: "chain" } }],
        [{ $facet: { sub: [{ $match: {} }] } }],
        [{ $bucket: { groupBy: "$amount", boundaries: [0, 50, 100] } }],
        [{ $sample: { size: 5 } }],
      ];

      for (const pipeline of attacks) {
        const validation = validateMQL(pipeline);
        expect(validation.ok).toBe(false);
        expect(validation.errors?.some((e) => e.includes("Forbidden") || e.includes("forbidden"))).toBe(true);
      }
    });

    it("rejects arbitrary JavaScript code execution inside aggregation stages ($function, $where, $accumulator)", () => {
      const codeInjections = [
        [{ $match: { $where: "this.amount > 0" } }],
        [{ $group: { _id: "$id", fn: { $function: { body: "function() { return 1; }", args: [], lang: "js" } } } }],
        [{ $group: { _id: "$id", acc: { $accumulator: { init: "function(){}", accumulate: "function(){}", merge: "function(){}", lang: "js" } } } }],
      ];

      for (const pipeline of codeInjections) {
        const validation = validateMQL(pipeline);
        expect(validation.ok).toBe(false);
        expect(validation.errors?.some((e) => e.includes("forbidden expression"))).toBe(true);
      }
    });

    it("enforces $lookup collection whitelist preventing access to system collections or user tables", () => {
      const unauthorizedLookups = ["users", "system.users", "evaluations", "passwords", "config", "sessions"];
      for (const forbiddenColl of unauthorizedLookups) {
        const pipe = [
          {
            $lookup: {
              from: forbiddenColl,
              localField: "customerId",
              foreignField: "id",
              as: "joined",
            },
          },
        ];
        const res = validateMQL(pipe);
        expect(res.ok).toBe(false);
        expect(res.errors).toContain("$lookup collection is not approved.");
      }
    });

    it("enforces stage bounds (1 to 12) and limit bounds (1 to 1000)", () => {
      // Empty pipeline
      expect(validateMQL([]).ok).toBe(false);

      // Oversized pipeline (13 stages)
      const oversized = Array.from({ length: 13 }, () => ({ $match: { status: "active" } }));
      expect(validateMQL(oversized).ok).toBe(false);

      // Invalid limits
      expect(validateMQL([{ $limit: 0 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: -1 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: 1001 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: 5.5 }]).ok).toBe(false);

      // Valid limit
      expect(validateMQL([{ $limit: 100 }]).ok).toBe(true);
    });

    it("verifies read-only SQL validator rejects SQL mutations and comments", () => {
      const badSqls = [
        "INSERT INTO orders (id, amount) VALUES (1, 50);",
        "UPDATE customers SET region = 'NA';",
        "DELETE FROM orders WHERE id = 1;",
        "DROP TABLE customers;",
        "TRUNCATE orders;",
        "SELECT * FROM orders; DROP TABLE orders;",
        "SELECT * FROM orders -- hidden comment",
        "SELECT * FROM orders /* comment block */",
      ];

      for (const sql of badSqls) {
        const safety = validateReadOnlySql(sql);
        expect(safety.status).toBe("rejected");
        expect(safety.score).toBe(0);
      }

      const goodSql = "SELECT customer_id, SUM(amount) FROM orders WHERE order_status = 'completed' GROUP BY customer_id;";
      const goodSafety = validateReadOnlySql(goodSql);
      expect(goodSafety.status).toBe("validated");
      expect(goodSafety.score).toBe(1);
    });

    it("gracefully falls back when external LLM API is unavailable without crashing", async () => {
      // buildSemanticQuery with useLlm=true and executeDemo=true
      const result = await buildSemanticQuery("What were our revenue and orders by region in the last quarter?", true, true);
      expect(result).toBeDefined();
      expect(result.safety.status).toBe("validated");
      expect(result.result).toBeDefined();
      expect(result.result.rows.length).toBeGreaterThan(0);
      expect(result.llm).toBeDefined();
      expect(["grounded", "fallback"]).toContain(result.llm.status);
    });

    it("guarantees vector cosine similarity mathematical robustness (no NaN on dimension mismatch or zero vectors)", () => {
      // 1. Valid vectors
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);

      // 2. Dimension mismatch -> returns 0 (never NaN)
      const v384 = new Array(384).fill(0.05);
      const v128 = new Array(128).fill(0.05);
      expect(cosineSimilarity(v384, v128)).toBe(0);
      expect(cosineSimilarity(v128, v384)).toBe(0);

      // 3. Zero vectors -> returns 0 (never NaN)
      expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);

      // 4. Empty / malformed inputs
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity(null as any, [1, 2])).toBe(0);
      expect(cosineSimilarity([1, 2], undefined as any)).toBe(0);
    });

    it("validates semantic interpretation AST payloads against dynamic catalog definitions", () => {
      // 1. Approved metric & aliases match catalog
      expect(validateInterpretation({ metric: "Completed Revenue" }, standardDefinitions).ok).toBe(true);
      expect(validateInterpretation({ metric: "revenue" }, standardDefinitions).ok).toBe(true);
      expect(validateInterpretation({ metric: "gmv" }, standardDefinitions).ok).toBe(true);
      expect(validateInterpretation({ metric: "cac" }, standardDefinitions).ok).toBe(true);
      expect(validateInterpretation({ metric: "aov" }, standardDefinitions).ok).toBe(true);
      expect(validateInterpretation({ metric: "Unresolved" }, standardDefinitions).ok).toBe(true);

      // 2. Unapproved metric rejected when catalog supplied
      const unapproved = validateInterpretation({ metric: "NonExistent Fake Metric" }, standardDefinitions);
      expect(unapproved.ok).toBe(false);
      expect(unapproved.valid).toBe(false);
      expect(unapproved.errors?.[0]).toMatch(/not in the governed semantic catalog/);

      // 3. Floating-point number rejection
      const floatRes = validateInterpretation({ amount: 125.75 });
      expect(floatRes.ok).toBe(false);
      expect(floatRes.errors?.[0]).toContain("floating-point number");

      // 4. Decimal string acceptance
      expect(validateInterpretation({ amount: "125.75" }).ok).toBe(true);
      expect(validateInterpretation({ amount: "-42.00" }).ok).toBe(true);
      expect(validateInterpretation({ amount: "1000" }).ok).toBe(true);

      // 5. Malformed number string rejection
      expect(validateInterpretation({ amount: "1e5" }).ok).toBe(false);
      expect(validateInterpretation({ amount: "0x3A" }).ok).toBe(false);
    });
  });
});
