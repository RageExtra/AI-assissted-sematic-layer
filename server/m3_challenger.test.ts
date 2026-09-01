import { describe, it, expect, beforeAll } from "vitest";
import { validateMQL } from "./mqlValidator.js";
import { compileASTtoMQL } from "./mqlCompiler.js";
import { getDb } from "./db.js";
import { buildSemanticQuery } from "./semanticEngine.js";
import { answerBusinessQuestion } from "./datasetEngine.js";

describe("Milestone M3 Empirical Adversarial Suite", () => {
  // =========================================================================
  // 1. MQL Validator Security & Injection Stress-Testing
  // =========================================================================
  describe("MQL Validator Security Whitelist & Edge Cases", () => {
    it("rejects non-array pipeline inputs (primitives, null, undefined, objects)", () => {
      expect(validateMQL(null).ok).toBe(false);
      expect(validateMQL(undefined).ok).toBe(false);
      expect(validateMQL("db.orders.find()").ok).toBe(false);
      expect(validateMQL(12345).ok).toBe(false);
      expect(validateMQL({ $match: {} }).ok).toBe(false);
    });

    it("rejects empty pipelines or pipelines exceeding MAX_STAGES (12)", () => {
      expect(validateMQL([]).ok).toBe(false);
      expect(validateMQL([]).errors?.[0]).toContain("between 1 and 12");

      const exactly12Stages = Array.from({ length: 12 }, () => ({ $match: { active: true } }));
      expect(validateMQL(exactly12Stages).ok).toBe(true);

      const thirteenStages = Array.from({ length: 13 }, () => ({ $match: { active: true } }));
      expect(validateMQL(thirteenStages).ok).toBe(false);
      expect(validateMQL(thirteenStages).errors?.[0]).toContain("between 1 and 12");
    });

    it("rejects stages with zero or multiple keys per stage object", () => {
      expect(validateMQL([{}]).ok).toBe(false);
      expect(validateMQL([{ $match: {}, $project: { _id: 1 } }]).ok).toBe(false);
      expect(validateMQL([{ $match: {}, $sort: { amount: -1 } }]).errors?.[0]).toContain("exactly one operator");
    });

    it("rejects invalid/non-object stage elements", () => {
      expect(validateMQL([null]).ok).toBe(false);
      expect(validateMQL(["$match"]).ok).toBe(false);
      expect(validateMQL([[ { $match: {} } ]]).ok).toBe(false);
    });

    it("blocks dangerous aggregation operators ($out, $merge, $unionWith, $accumulator, $function, $where)", () => {
      const dangerousPipelines = [
        [{ $out: "production_backup" }],
        [{ $merge: { into: "users" } }],
        [{ $unionWith: { coll: "secrets" } }],
        [{ $match: { $where: "this.password.length > 0" } }],
        [{ $project: { result: { $function: { body: "function() { return 1; }", args: [], lang: "js" } } } }],
        [{ $group: { _id: null, total: { $accumulator: { init: "function() {}", accumulate: "function() {}", lang: "js" } } } }],
      ];

      for (const pipeline of dangerousPipelines) {
        const res = validateMQL(pipeline);
        expect(res.ok).toBe(false);
        expect(res.errors?.some(e => e.includes("Forbidden") || e.includes("forbidden"))).toBe(true);
      }
    });

    it("strictly validates $limit values (integer 1-1000, rejects 0, negative, floats, >1000)", () => {
      expect(validateMQL([{ $limit: 100 }]).ok).toBe(true);
      expect(validateMQL([{ $limit: 1 }]).ok).toBe(true);
      expect(validateMQL([{ $limit: 1000 }]).ok).toBe(true);

      expect(validateMQL([{ $limit: 0 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: -5 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: 1001 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: 50.5 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: "100" as any }]).ok).toBe(false);
    });

    it("strictly checks $lookup target collections and join parameters", () => {
      // Allowed collections
      expect(validateMQL([{ $lookup: { from: "customers", localField: "customerId", foreignField: "customerId", as: "customer" } }]).ok).toBe(true);
      expect(validateMQL([{ $lookup: { from: "orders", localField: "orderId", foreignField: "orderId", as: "order" } }]).ok).toBe(true);
      expect(validateMQL([{ $lookup: { from: "dataset_6f8b9e", localField: "id", foreignField: "id", as: "joined_data" } }]).ok).toBe(true);

      // Disallowed collections
      expect(validateMQL([{ $lookup: { from: "users", localField: "userId", foreignField: "id", as: "user" } }]).ok).toBe(false);
      expect(validateMQL([{ $lookup: { from: "system.views", localField: "id", foreignField: "id", as: "v" } }]).ok).toBe(false);
      expect(validateMQL([{ $lookup: { from: "secrets", localField: "id", foreignField: "id", as: "s" } }]).ok).toBe(false);

      // Disallowed pipeline joins (only simple equality allowed)
      expect(validateMQL([{ $lookup: { from: "customers", let: { cid: "$customerId" }, pipeline: [{ $match: {} }], as: "cust" } }]).ok).toBe(false);
    });
  });

  // =========================================================================
  // 2. Dynamic MQL Compiler Matrix (Aggregations, Grains, Joins, Expressions)
  // =========================================================================
  describe("Dynamic MQL Compiler Expressions & Joins", () => {
    const mockDefinitions = [
      {
        name: "Completed Revenue",
        kind: "metric",
        expression: "SUM(orders.amount) WHERE orders.order_status = 'completed'",
        aliases: ["revenue", "sales", "gmv"],
      },
      {
        name: "Average Order Value",
        kind: "metric",
        expression: "AVG(orders.amount) WHERE orders.order_status = 'completed'",
        aliases: ["aov"],
      },
      {
        name: "Order Count",
        kind: "metric",
        expression: "COUNT(orders.order_id) WHERE orders.order_status = 'completed'",
        aliases: ["orders_count", "volume"],
      },
      {
        name: "Min Order Amount",
        kind: "metric",
        expression: "MIN(orders.amount)",
        aliases: ["min_amount"],
      },
      {
        name: "Max Order Amount",
        kind: "metric",
        expression: "MAX(orders.amount)",
        aliases: ["max_amount"],
      },
      {
        name: "Customer Region",
        kind: "dimension",
        expression: "customers.region",
        aliases: ["region", "geography"],
      },
      {
        name: "Customer Name",
        kind: "dimension",
        expression: "customers.customer_name",
        aliases: ["customer", "buyer"],
      },
      {
        name: "Order Month",
        kind: "dimension",
        expression: "orders.order_date",
        aliases: ["month", "date"],
      },
      {
        name: "Orders to Customers Relationship",
        kind: "relationship",
        expression: "orders.customer_id = customers.customer_id",
      },
      {
        name: "Custom Sales Dataset",
        kind: "entity",
        expression: "dataset_sales_101",
      },
      {
        name: "Custom Stores Dataset",
        kind: "entity",
        expression: "dataset_stores_202",
      },
      {
        name: "Custom Dataset Relationship",
        kind: "relationship",
        expression: "dataset_sales_101.store_id = dataset_stores_202.store_id",
      },
    ];

    it("compiles SUM metric with cross-collection relationship dimension", () => {
      const compiled = compileASTtoMQL("Completed Revenue", "Customer Region", mockDefinitions);
      expect(compiled.targetCollection).toBe("orders");
      expect(compiled.columns).toEqual(["Region", "Revenue"]);

      // Verify MQL structure
      const matchStage = compiled.mql.find(s => s.$match);
      expect(matchStage).toBeDefined();
      expect(matchStage.$match).toEqual({ orderStatus: "completed" });

      const lookupStage = compiled.mql.find(s => s.$lookup);
      expect(lookupStage).toBeDefined();
      expect(lookupStage.$lookup.from).toBe("customers");
      expect(lookupStage.$lookup.localField).toBe("customerId");
      expect(lookupStage.$lookup.foreignField).toBe("customerId");

      const unwindStage = compiled.mql.find(s => s.$unwind);
      expect(unwindStage.$unwind).toBe("$customer");

      const groupStage = compiled.mql.find(s => s.$group);
      expect(groupStage.$group._id).toBe("$customer.region");
      expect(groupStage.$group.revenue).toEqual({ $sum: { $toDouble: "$amount" } });

      // Check security validation
      const validation = validateMQL(compiled.mql);
      expect(validation.ok).toBe(true);
    });

    it("compiles AVG aggregation with alias matching and dimension lookup", () => {
      const compiled = compileASTtoMQL("aov", "Customer Region", mockDefinitions);
      expect(compiled.columns).toEqual(["Region", "Average Order Value"]);

      const groupStage = compiled.mql.find(s => s.$group);
      expect(groupStage.$group.average_order_value).toEqual({ $avg: { $toDouble: "$amount" } });

      const validation = validateMQL(compiled.mql);
      expect(validation.ok).toBe(true);
    });

    it("compiles COUNT aggregation", () => {
      const compiled = compileASTtoMQL("volume", "Customer Name", mockDefinitions);
      expect(compiled.columns).toEqual(["Customer Name", "Order Count"]);

      const groupStage = compiled.mql.find(s => s.$group);
      expect(groupStage.$group.order_count).toEqual({ $sum: 1 });

      const validation = validateMQL(compiled.mql);
      expect(validation.ok).toBe(true);
    });

    it("compiles MIN and MAX aggregations", () => {
      const minCompiled = compileASTtoMQL("Min Order Amount", "Customer Region", mockDefinitions);
      const minGroup = minCompiled.mql.find(s => s.$group);
      expect(minGroup.$group.min_order_amount).toEqual({ $min: { $toDouble: "$amount" } });
      expect(validateMQL(minCompiled.mql).ok).toBe(true);

      const maxCompiled = compileASTtoMQL("Max Order Amount", "Customer Region", mockDefinitions);
      const maxGroup = maxCompiled.mql.find(s => s.$group);
      expect(maxGroup.$group.max_order_amount).toEqual({ $max: { $toDouble: "$amount" } });
      expect(validateMQL(maxCompiled.mql).ok).toBe(true);
    });

    it("compiles calendar grain (Month) with $substrCP", () => {
      const compiled = compileASTtoMQL("Completed Revenue", "Month", mockDefinitions);
      expect(compiled.columns).toEqual(["Order Month", "Revenue"]);

      // Intra-collection (both on orders), so no lookup
      const lookupStage = compiled.mql.find(s => s.$lookup);
      expect(lookupStage).toBeUndefined();

      const groupStage = compiled.mql.find(s => s.$group);
      expect(groupStage.$group._id).toEqual({ $substrCP: ["$orderDate", 0, 7] });

      const validation = validateMQL(compiled.mql);
      expect(validation.ok).toBe(true);
    });

    it("compiles scalar queries with no dimension (_id: null)", () => {
      const compiled = compileASTtoMQL("Completed Revenue", undefined, mockDefinitions);
      expect(compiled.columns).toEqual(["Revenue"]);

      const groupStage = compiled.mql.find(s => s.$group);
      expect(groupStage.$group._id).toBeNull();
      expect(groupStage.$group.revenue).toEqual({ $sum: { $toDouble: "$amount" } });

      const projectStage = compiled.mql.find(s => s.$project);
      expect(projectStage.$project).toEqual({ _id: 0, Revenue: "$revenue" });

      const validation = validateMQL(compiled.mql);
      expect(validation.ok).toBe(true);
    });

    it("compiles cross-dataset join between custom uploaded datasets", () => {
      const customMetric = "SUM(dataset_sales_101.sales_amount)";
      const customDim = "dataset_stores_202.store_city";

      const compiled = compileASTtoMQL(customMetric, customDim, mockDefinitions);
      expect(compiled.targetCollection).toBe("dataset_sales_101");

      const lookupStage = compiled.mql.find(s => s.$lookup);
      expect(lookupStage).toBeDefined();
      expect(lookupStage.$lookup.from).toBe("dataset_stores_202");
      expect(lookupStage.$lookup.localField).toBe("storeId");
      expect(lookupStage.$lookup.foreignField).toBe("storeId");

      const validation = validateMQL(compiled.mql);
      expect(validation.ok).toBe(true);
    });

    it("falls back cleanly when no matching relationship is defined", () => {
      const customMetric = "SUM(dataset_sales_101.sales_amount)";
      const unknownDim = "dataset_unrelated.category";

      const compiled = compileASTtoMQL(customMetric, unknownDim, mockDefinitions);
      const lookupStage = compiled.mql.find(s => s.$lookup);
      expect(lookupStage).toBeDefined();
      expect(lookupStage.$lookup.from).toBe("dataset_unrelated");
      // Fallback uses inferred keys
      expect(lookupStage.$lookup.localField).toBe("dataset_unrelatedId");
      expect(lookupStage.$lookup.foreignField).toBe("id");
    });

    it("handles variations in WHERE expressions (quotes, case, numbers)", () => {
      const exprDoubleQuotes = "SUM(orders.amount) WHERE orders.order_status = \"shipped\"";
      const compiled1 = compileASTtoMQL(exprDoubleQuotes, undefined, []);
      expect(compiled1.mql[0].$match).toEqual({ orderStatus: "shipped" });

      const exprNumeric = "SUM(orders.amount) WHERE orders.status_code = 200";
      const compiled2 = compileASTtoMQL(exprNumeric, undefined, []);
      expect(compiled2.mql[0].$match).toEqual({ statusCode: "200" });

      const exprLowerWhere = "sum(orders.amount) where orders.is_active = 'true'";
      const compiled3 = compileASTtoMQL(exprLowerWhere, undefined, []);
      expect(compiled3.mql[0].$match).toEqual({ isActive: "true" });
    });
  });

  // =========================================================================
  // 3. Database Execution & Empirical Aggregation Calculations
  // =========================================================================
  describe("Empirical Execution of Dynamic MQL on MongoDB", () => {
    const ordersCollection = "orders";
    const customersCollection = "customers";

    const definitions = [
      {
        name: "Completed Revenue",
        kind: "metric",
        expression: "SUM(orders.amount) WHERE orders.order_status = 'completed'",
      },
      {
        name: "Average Order Value",
        kind: "metric",
        expression: "AVG(orders.amount) WHERE orders.order_status = 'completed'",
      },
      {
        name: "Order Count",
        kind: "metric",
        expression: "COUNT(orders.order_id) WHERE orders.order_status = 'completed'",
      },
      {
        name: "Customer Region",
        kind: "dimension",
        expression: "customers.region",
      },
      {
        name: "Orders Customers Rel",
        kind: "relationship",
        expression: "orders.customer_id = customers.customer_id",
      },
    ];

    beforeAll(async () => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Seed customers
      await db.collection(customersCollection).deleteMany({});
      await db.collection(customersCollection).insertMany([
        { customerId: "C1", customerName: "Alpha Corp", region: "North America" },
        { customerId: "C2", customerName: "Beta Ltd", region: "Europe" },
        { customerId: "C3", customerName: "Gamma Inc", region: "North America" },
      ]);

      // Seed orders
      await db.collection(ordersCollection).deleteMany({});
      await db.collection(ordersCollection).insertMany([
        { orderId: "O1", customerId: "C1", amount: 1000, orderStatus: "completed", orderDate: "2026-01-15" },
        { orderId: "O2", customerId: "C1", amount: 500, orderStatus: "completed", orderDate: "2026-01-20" },
        { orderId: "O3", customerId: "C2", amount: 2000, orderStatus: "completed", orderDate: "2026-02-10" },
        { orderId: "O4", customerId: "C3", amount: 300, orderStatus: "cancelled", orderDate: "2026-02-15" },
        { orderId: "O5", customerId: "C3", amount: 1500, orderStatus: "completed", orderDate: "2026-03-05" },
      ]);
    });

    it("accurately executes dynamic SUM and join over in-memory MongoDB", async () => {
      const db = await getDb();
      const compiled = compileASTtoMQL("Completed Revenue", "Customer Region", definitions);

      const rows = await db!.collection(compiled.targetCollection).aggregate(compiled.mql).toArray();
      expect(rows.length).toBe(2);

      // North America: C1 (1000 + 500) + C3 (1500) = 3000 (cancelled 300 excluded)
      // Europe: C2 (2000) = 2000
      const naRow = rows.find(r => r.Region === "North America");
      const euRow = rows.find(r => r.Region === "Europe");

      expect(naRow).toBeDefined();
      expect(naRow?.Revenue).toBe(3000);
      expect(euRow).toBeDefined();
      expect(euRow?.Revenue).toBe(2000);
    });

    it("accurately executes dynamic AVG aggregation", async () => {
      const db = await getDb();
      const compiled = compileASTtoMQL("Average Order Value", "Customer Region", definitions);

      const rows = await db!.collection(compiled.targetCollection).aggregate(compiled.mql).toArray();
      const naRow = rows.find(r => r.Region === "North America");
      // NA has 3 completed orders: 1000, 500, 1500 -> avg = 3000 / 3 = 1000
      expect(naRow?.["Average Order Value"]).toBe(1000);
    });

    it("accurately executes dynamic COUNT aggregation", async () => {
      const db = await getDb();
      const compiled = compileASTtoMQL("Order Count", "Customer Region", definitions);

      const rows = await db!.collection(compiled.targetCollection).aggregate(compiled.mql).toArray();
      const naRow = rows.find(r => r.Region === "North America");
      expect(naRow?.["Order Count"]).toBe(3);
    });

    it("accurately executes scalar aggregation with no dimension", async () => {
      const db = await getDb();
      const compiled = compileASTtoMQL("Completed Revenue", undefined, definitions);

      const rows = await db!.collection(compiled.targetCollection).aggregate(compiled.mql).toArray();
      expect(rows.length).toBe(1);
      // Total completed: 1000 + 500 + 2000 + 1500 = 5000
      expect(rows[0].Revenue).toBe(5000);
    });
  });

  // =========================================================================
  // 4. Ambiguity Gating & Safety Checks
  // =========================================================================
  describe("Ambiguity Gating & Error Self-Correction", () => {
    it("gates underspecified / vague prompts with clarification_required and blocks query execution", async () => {
      const vagueQueries = [
        "Show performance",
        "Give me an overview",
        "Company health",
        "Business insights",
      ];

      for (const q of vagueQueries) {
        const queryRun = await buildSemanticQuery(q, false, false);
        expect(queryRun.ambiguity.detected).toBe(true);
        expect(queryRun.safety.status).toBe("clarification_required");
        expect(queryRun.sql).toBe("");
        expect(queryRun.metric).toBe("Unresolved");
        expect(queryRun.dimension).toBe("Unresolved");
        expect(queryRun.ambiguity.questions.length).toBeGreaterThan(0);
      }
    });

    it("executes specific deterministic queries without ambiguity gating", async () => {
      const specificQueries = [
        "Show completed revenue by region",
        "Show top customers by completed revenue",
        "Show monthly revenue trend",
      ];

      for (const q of specificQueries) {
        const queryRun = await buildSemanticQuery(q, false, false);
        expect(queryRun.ambiguity.detected).toBe(false);
        expect(queryRun.safety.status).toBe("validated");
        expect(queryRun.sql).not.toBe("");
        expect(queryRun.metric).not.toBe("Unresolved");
      }
    });

    it("handles conversational quick replies deterministically without LLM", async () => {
      const greetings = ["Hi", "Hello!", "Good morning", "Help", "What can you do?"];
      for (const g of greetings) {
        const reply = await answerBusinessQuestion([{ role: "user", content: g }]);
        expect(reply).toContain("Hello. I can analyze uploaded business and finance data");
      }

      const thanks = ["Thanks", "Thank you", "Thanks!"];
      for (const t of thanks) {
        const reply = await answerBusinessQuestion([{ role: "user", content: t }]);
        expect(reply).toContain("You're welcome");
      }
    });

    it("gracefully falls back when LLM is unavailable for general questions", async () => {
      const reply = await answerBusinessQuestion([{ role: "user", content: "What were total sales last quarter?" }]);
      expect(reply).toContain("I encountered an issue processing your question against the governed catalog");
    });

    it("throws a descriptive error if user question is missing in datasetEngine", async () => {
      await expect(answerBusinessQuestion([])).rejects.toThrow("A user question is required.");
    });
  });
});
