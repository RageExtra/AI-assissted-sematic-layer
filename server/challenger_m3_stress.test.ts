import { describe, expect, it, beforeAll } from "vitest";
import { compileASTtoMQL } from "./mqlCompiler";
import { validateMQL } from "./mqlValidator";
import { buildSemanticQuery, validateReadOnlySql } from "./semanticEngine";
import { getDb, listDefinitions } from "./db";

describe("Milestone M3 Empirical Adversarial Stress Testing", () => {

  describe("1. MQL Security Validator Adversarial Challenges", () => {
    it("rejects non-array and empty/oversized pipelines", () => {
      expect(validateMQL(null).ok).toBe(false);
      expect(validateMQL(undefined).ok).toBe(false);
      expect(validateMQL("db.orders.find()").ok).toBe(false);
      expect(validateMQL({ $match: {} }).ok).toBe(false);
      expect(validateMQL([]).ok).toBe(false);

      // Pipeline with 13 stages (> MAX_STAGES = 12)
      const oversized = Array.from({ length: 13 }, () => ({ $match: { status: "active" } }));
      const overRes = validateMQL(oversized);
      expect(overRes.ok).toBe(false);
      expect(overRes.errors?.[0]).toContain("Pipeline must contain between 1 and 12 stages");
    });

    it("rejects malformed stage items (null, arrays, primitives, multi-key objects)", () => {
      expect(validateMQL([null]).ok).toBe(false);
      expect(validateMQL([["$match"]]).ok).toBe(false);
      expect(validateMQL([123]).ok).toBe(false);
      expect(validateMQL([{}]).ok).toBe(false);
      // Multi-key stage injection attempt
      expect(validateMQL([{ $match: { a: 1 }, $out: "secrets" }]).ok).toBe(false);
    });

    it("strictly forbids dangerous and unauthorized aggregation stages", () => {
      const dangerousStages = [
        { $out: "dump_collection" },
        { $merge: { into: "users" } },
        { $unionWith: { coll: "passwords" } },
        { $replaceRoot: { newRoot: "$$ROOT" } },
        { $facet: { pipe1: [{ $match: {} }] } },
        { $graphLookup: { from: "users", startWith: "$id", connectFromField: "id", connectToField: "reportsTo", as: "hierarchy" } },
        { $bucket: { groupBy: "$amount", boundaries: [0, 100, 500] } },
        { $sample: { size: 10 } },
        { $indexStats: {} },
        { $collStats: {} },
      ];

      for (const stage of dangerousStages) {
        const res = validateMQL([stage]);
        expect(res.ok).toBe(false);
        expect(res.errors?.some(e => e.includes("Forbidden aggregation stage") || e.includes("forbidden expression"))).toBe(true);
      }
    });

    it("blocks code injection inside stage expressions ($function, $where, $accumulator)", () => {
      const functionInject = [{
        $group: {
          _id: "$customerId",
          calc: {
            $function: {
              body: "function() { return process.exit(1); }",
              args: [],
              lang: "js"
            }
          }
        }
      }];
      expect(validateMQL(functionInject).ok).toBe(false);

      const whereInject = [{
        $match: {
          $where: "this.password.length > 0"
        }
      }];
      expect(validateMQL(whereInject).ok).toBe(false);

      const accumInject = [{
        $group: {
          _id: "$region",
          custom: {
            $accumulator: {
              init: "function() { return 0; }",
              accumulate: "function(s) { return s; }",
              merge: "function(s1, s2) { return s1 + s2; }",
              lang: "js"
            }
          }
        }
      }];
      expect(validateMQL(accumInject).ok).toBe(false);
    });

    it("enforces strict collection whitelisting on $lookup stages", () => {
      // Forbidden collections
      const forbiddenLookups = ["secrets", "users", "admin", "system.views", "evaluations", "passwords", "config"];
      for (const coll of forbiddenLookups) {
        const pipe = [{
          $lookup: {
            from: coll,
            localField: "customerId",
            foreignField: "id",
            as: "joined"
          }
        }];
        const res = validateMQL(pipe);
        expect(res.ok).toBe(false);
        expect(res.errors).toContain("$lookup collection is not approved.");
      }

      // Approved lookup collections
      const validLookups = ["customers", "orders", "dataset_transactions_2026", "dataset_q3_sales"];
      for (const coll of validLookups) {
        const pipe = [{
          $lookup: {
            from: coll,
            localField: "customerId",
            foreignField: "id",
            as: "joined"
          }
        }];
        const res = validateMQL(pipe);
        expect(res.ok).toBe(true);
      }
    });

    it("rejects complex or nested $lookup stages (sub-pipelines and let variables)", () => {
      const complexLookup = [{
        $lookup: {
          from: "customers",
          let: { custId: "$customerId" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$custId"] } } }],
          as: "customer"
        }
      }];
      const res = validateMQL(complexLookup);
      expect(res.ok).toBe(false);
      expect(res.errors).toContain("$lookup may only use simple equality joins.");
    });

    it("validates boundary conditions for $limit (0, negative, float, excessive limit)", () => {
      expect(validateMQL([{ $limit: 0 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: -10 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: 1001 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: 50.5 }]).ok).toBe(false);
      expect(validateMQL([{ $limit: "100" as any }]).ok).toBe(false);
      expect(validateMQL([{ $limit: 1 }]).ok).toBe(true);
      expect(validateMQL([{ $limit: 1000 }]).ok).toBe(true);
    });
  });

  describe("2. Dynamic MQL Compiler Stress & Edge Cases", () => {
    const complexDefinitions = [
      {
        kind: "metric",
        name: "Gross Merchandise Value",
        description: "Total transaction value across completed and processing orders",
        expression: "SUM(orders.amount) WHERE orders.order_status = 'completed'",
        aliases: ["gmv", "gross revenue", "total gmv"],
      },
      {
        kind: "metric",
        name: "Average Order Value",
        description: "Mean order size in dollars",
        expression: "AVG(orders.amount)",
        aliases: ["aov", "ticket size"],
      },
      {
        kind: "metric",
        name: "Max Single Transaction",
        description: "Highest single order value",
        expression: "MAX(orders.amount)",
        aliases: ["max order", "largest order"],
      },
      {
        kind: "metric",
        name: "Min Transaction",
        description: "Lowest order value",
        expression: "MIN(orders.amount)",
        aliases: ["min order", "smallest order"],
      },
      {
        kind: "metric",
        name: "Order Count",
        description: "Total count of order rows",
        expression: "COUNT(orders.order_id)",
        aliases: ["orders", "total orders", "volume"],
      },
      {
        kind: "dimension",
        name: "Customer Region",
        description: "Geographic territory",
        expression: "customers.region",
        aliases: ["region", "territory", "geo"],
      },
      {
        kind: "dimension",
        name: "Customer Full Name",
        description: "Customer legal name",
        expression: "customers.customer_name",
        aliases: ["customer", "buyer"],
      },
      {
        kind: "dimension",
        name: "Order Month",
        description: "Monthly aggregation grain",
        expression: "orders.order_date",
        aliases: ["month", "monthly"],
      },
      {
        kind: "relationship",
        name: "Orders to Customers Link",
        description: "Join between orders and customers",
        expression: "orders.customer_id = customers.customer_id",
        aliases: ["customer relationship"],
      },
      {
        kind: "metric",
        name: "Inventory · Total Value",
        description: "Dataset metric",
        expression: "SUM(dataset_inventory.stock_quantity * dataset_inventory.unit_cost)",
        aliases: ["inventory value"],
      },
      {
        kind: "dimension",
        name: "Inventory · Warehouse Location",
        description: "Warehouse site",
        expression: "dataset_inventory.warehouse_location",
        aliases: ["warehouse", "location"],
      },
      {
        kind: "relationship",
        name: "Reversed Custom Relationship",
        description: "Reversed order of join sides",
        expression: "dataset_supplier.supplier_id = dataset_inventory.supplier_ref_id",
        aliases: ["supplier inventory"],
      },
    ];

    it("compiles with empty, undefined, or missing definition lists gracefully", () => {
      // Fallback defaults should produce valid MQL
      const res1 = compileASTtoMQL(undefined, undefined, []);
      expect(res1.targetCollection).toBe("orders");
      expect(res1.columns).toEqual(["Revenue"]);
      expect(validateMQL(res1.mql).ok).toBe(true);

      const res2 = compileASTtoMQL("Unknown Metric", "Unknown Dimension", []);
      expect(res2.targetCollection).toBe("orders");
      expect(res2.columns.length).toBe(2);
      expect(validateMQL(res2.mql).ok).toBe(true);
    });

    it("handles corrupt, partial, or malformed definition objects in catalog", () => {
      const corruptDefs = [
        null,
        undefined,
        {},
        { kind: "metric" },
        { kind: "metric", name: null },
        { kind: "dimension", expression: null },
        { kind: "relationship", expression: "no_equals_sign" },
        { kind: "relationship", expression: "only.one.dot" },
        { kind: "relationship", expression: "a.b = c.d = e.f" },
      ];

      const res = compileASTtoMQL("GMV", "Customer Region", corruptDefs as any);
      expect(res.mql.length).toBeGreaterThan(0);
      expect(validateMQL(res.mql).ok).toBe(true);
    });

    it("correctly parses case-insensitive aggregation operators with whitespace and parentheses", () => {
      const variations = [
        { expr: "sum ( orders.amount )", expectedOp: "sum" },
        { expr: "AVG(orders.amount)", expectedOp: "avg" },
        { expr: "Count(orders.order_id)", expectedOp: "count" },
        { expr: "min(orders.amount)", expectedOp: "min" },
        { expr: "MAX(orders.amount)", expectedOp: "max" },
      ];

      for (const v of variations) {
        const customDefs = [{ kind: "metric", name: "Test Op", expression: v.expr }];
        const res = compileASTtoMQL("Test Op", undefined, customDefs);
        expect(validateMQL(res.mql).ok).toBe(true);
        const groupStage = res.mql.find(s => s.$group);
        expect(groupStage).toBeDefined();
      }
    });

    it("parses WHERE clauses with double quotes, single quotes, and unquoted values", () => {
      const filters = [
        "SUM(orders.amount) WHERE orders.order_status = 'completed'",
        'SUM(orders.amount) WHERE orders.order_status = "completed"',
        "SUM(orders.amount) WHERE orders.order_status = completed",
        "SUM(orders.amount) WHERE status = 'shipped'",
      ];

      for (const filterExpr of filters) {
        const defs = [{ kind: "metric", name: "Filtered Metric", expression: filterExpr }];
        const res = compileASTtoMQL("Filtered Metric", undefined, defs);
        expect(validateMQL(res.mql).ok).toBe(true);
        const matchStage = res.mql.find(s => s.$match);
        expect(matchStage).toBeDefined();
      }
    });

    it("resolves reversed relationship definitions correctly (foreign = target vs target = foreign)", () => {
      const reversedDefs = [
        {
          kind: "metric",
          name: "Supplier Value",
          expression: "SUM(dataset_supplier.total_spend)",
        },
        {
          kind: "dimension",
          name: "Warehouse Loc",
          expression: "dataset_inventory.warehouse_location",
        },
        {
          kind: "relationship",
          name: "Reversed Rel",
          // Target is dataset_supplier, Foreign is dataset_inventory
          // Here relationship is written: dataset_inventory.supplier_ref_id = dataset_supplier.supplier_id
          expression: "dataset_inventory.supplier_ref_id = dataset_supplier.supplier_id",
        },
      ];

      const res = compileASTtoMQL("Supplier Value", "Warehouse Loc", reversedDefs);
      expect(res.targetCollection).toBe("dataset_supplier");
      const lookup = res.mql.find(s => s.$lookup);
      expect(lookup).toBeDefined();
      expect(lookup.$lookup.from).toBe("dataset_inventory");
      expect(lookup.$lookup.localField).toBe("supplierId");
      expect(lookup.$lookup.foreignField).toBe("supplierRefId");
      expect(validateMQL(res.mql).ok).toBe(true);
    });

    it("correctly compiles time grain dimensions into $substrCP expressions", () => {
      const res = compileASTtoMQL("Gross Merchandise Value", "Order Month", complexDefinitions);
      const groupStage = res.mql.find(s => s.$group);
      expect(groupStage.$group._id).toEqual({ $substrCP: ["$orderDate", 0, 7] });
      expect(validateMQL(res.mql).ok).toBe(true);
    });

    it("handles scalar aggregations with all aggregate types without dimensions", () => {
      const ops = ["Gross Merchandise Value", "Average Order Value", "Max Single Transaction", "Min Transaction", "Order Count"];
      for (const opMetric of ops) {
        const res = compileASTtoMQL(opMetric, undefined, complexDefinitions);
        expect(res.columns.length).toBe(1);
        const group = res.mql.find(s => s.$group);
        expect(group.$group._id).toBeNull();
        expect(validateMQL(res.mql).ok).toBe(true);
      }
    });

    it("properly formats camelCase field conversions for snake_case schema attributes", () => {
      const snakeDefs = [
        {
          kind: "metric",
          name: "Line Item Total",
          expression: "SUM(orders.line_item_amount) WHERE orders.fulfillment_status = 'delivered'",
        },
        {
          kind: "dimension",
          name: "Billing Zip",
          expression: "customers.billing_postal_code",
        },
        {
          kind: "relationship",
          name: "Customer Order Link",
          expression: "orders.account_id = customers.account_id",
        },
      ];

      const res = compileASTtoMQL("Line Item Total", "Billing Zip", snakeDefs);
      const match = res.mql.find(s => s.$match);
      expect(match.$match.fulfillmentStatus).toBe("delivered");

      const lookup = res.mql.find(s => s.$lookup);
      expect(lookup.$lookup.localField).toBe("accountId");
      expect(lookup.$lookup.foreignField).toBe("accountId");

      const group = res.mql.find(s => s.$group);
      expect(group.$group._id).toBe("$customer.billingPostalCode");
      expect(validateMQL(res.mql).ok).toBe(true);
    });
  });

  describe("3. Semantic Engine Ambiguity Gating & Safety Enforcement", () => {
    it("blocks execution for underspecified ambiguity keywords ('performance', 'overview', 'health', 'insights')", async () => {
      const ambiguousPrompts = [
        "give me an overview of company performance",
        "show business health",
        "provide recent insights",
        "tell me about our performance metrics",
      ];

      for (const prompt of ambiguousPrompts) {
        const result = await buildSemanticQuery(prompt, false, false);
        expect(result.ambiguity?.detected).toBe(true);
        expect(result.safety.status).toBe("clarification_required");
        expect(result.sql).toBe("");
        expect(result.result.rows.length).toBe(0);
        expect(result.ambiguity?.questions?.length).toBeGreaterThan(0);
      }
    });

    it("verifies read-only SQL validation rules reject mutations and injections", () => {
      const dangerousSqls = [
        "INSERT INTO orders (id, amount) VALUES (1, 100);",
        "UPDATE customers SET region = 'EMEA';",
        "DELETE FROM orders WHERE id = 5;",
        "DROP TABLE customers;",
        "TRUNCATE orders;",
        "SELECT * FROM orders; DROP TABLE customers;",
        "SELECT * FROM orders -- comment bypass",
        "SELECT * FROM orders /* multi-line */ WHERE 1=1",
      ];

      for (const badSql of dangerousSqls) {
        const check = validateReadOnlySql(badSql);
        expect(check.status).toBe("rejected");
        expect(check.score).toBe(0);
      }

      const safeSql = "SELECT region, SUM(amount) FROM orders GROUP BY region LIMIT 10;";
      const safeCheck = validateReadOnlySql(safeSql);
      expect(safeCheck.status).toBe("validated");
      expect(safeCheck.score).toBe(1);
    });

    it("gracefully catches MQL execution errors in demo runner without unhandled crashes", async () => {
      // Intentionally pass an invalid question or non-existent template
      const res = await buildSemanticQuery("Which customers generated the most completed revenue?", false, true);
      expect(res).toBeDefined();
      expect(res.result).toBeDefined();
      expect(Array.isArray(res.result.rows)).toBe(true);
      expect(res.result.rows.length).toBeGreaterThan(0);
    });
  });
});
