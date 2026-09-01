import { describe, expect, it } from "vitest";
import { compileASTtoMQL } from "./mqlCompiler";
import { validateMQL } from "./mqlValidator";

describe("MQL Dynamic Compiler & Schema Joins", () => {
  const standardDefinitions = [
    {
      kind: "metric",
      name: "Completed Revenue",
      description: "Recognized order value excluding refunds and pending orders.",
      expression: "SUM(orders.amount) WHERE orders.order_status = 'completed'",
      aliases: ["revenue", "sales", "completed revenue"],
    },
    {
      kind: "dimension",
      name: "Customer Region",
      description: "Commercial territory of customer.",
      expression: "customers.region",
      aliases: ["region", "territory"],
    },
    {
      kind: "dimension",
      name: "Customer",
      description: "Master customer entity name.",
      expression: "customers.customer_name",
      aliases: ["buyer", "client"],
    },
    {
      kind: "dimension",
      name: "Month",
      description: "Calendar month grain.",
      expression: "orders.order_date",
      aliases: ["monthly"],
    },
    {
      kind: "relationship",
      name: "Customer places Order",
      description: "One to many join from customer to orders.",
      expression: "customers.customer_id = orders.customer_id",
      aliases: ["customer orders"],
    },
  ];

  it("compiles standard Completed Revenue by Customer Region with lookup, unwind, and validation", () => {
    const result = compileASTtoMQL("Completed Revenue", "Customer Region", standardDefinitions);
    expect(result.targetCollection).toBe("orders");
    expect(result.columns).toEqual(["Region", "Revenue"]);
    
    // Check stages
    const matchStage = result.mql.find(s => s.$match);
    expect(matchStage).toBeDefined();
    expect(matchStage.$match.orderStatus).toBe("completed");

    const lookupStage = result.mql.find(s => s.$lookup);
    expect(lookupStage).toBeDefined();
    expect(lookupStage.$lookup.from).toBe("customers");
    expect(lookupStage.$lookup.localField).toBe("customerId");
    expect(lookupStage.$lookup.foreignField).toBe("customerId");

    const unwindStage = result.mql.find(s => s.$unwind);
    expect(unwindStage).toBeDefined();
    expect(unwindStage.$unwind).toBe("$customer");

    const groupStage = result.mql.find(s => s.$group);
    expect(groupStage).toBeDefined();
    expect(groupStage.$group._id).toBe("$customer.region");

    const projectStage = result.mql.find(s => s.$project);
    expect(projectStage).toBeDefined();
    expect(projectStage.$project.Region).toBe("$_id");
    expect(projectStage.$project.Revenue).toBe("$revenue");

    // Must pass MQL security validation
    const validation = validateMQL(result.mql);
    expect(validation.ok).toBe(true);
  });

  it("compiles Completed Revenue by Customer with ranking sort and limit", () => {
    const result = compileASTtoMQL("Completed Revenue", "Customer", standardDefinitions);
    expect(result.targetCollection).toBe("orders");
    expect(result.columns).toEqual(["Customer", "Revenue"]);

    const groupStage = result.mql.find(s => s.$group);
    expect(groupStage.$group._id).toBe("$customer.customerName");

    const sortStage = result.mql.find(s => s.$sort);
    expect(sortStage.$sort.Revenue).toBe(-1);

    const limitStage = result.mql.find(s => s.$limit);
    expect(limitStage.$limit).toBe(100);

    expect(validateMQL(result.mql).ok).toBe(true);
  });

  it("compiles Completed Revenue by Month without cross-collection lookup", () => {
    const result = compileASTtoMQL("Completed Revenue", "Month", standardDefinitions);
    expect(result.targetCollection).toBe("orders");
    expect(result.columns).toEqual(["Month", "Revenue"]);

    // Since Month is on orders, no lookup is needed
    const lookupStage = result.mql.find(s => s.$lookup);
    expect(lookupStage).toBeUndefined();

    const groupStage = result.mql.find(s => s.$group);
    expect(groupStage.$group._id).toEqual({ $substrCP: ["$orderDate", 0, 7] });

    expect(validateMQL(result.mql).ok).toBe(true);
  });

  it("compiles dynamic AVG metric expression across collections", () => {
    const customDefs = [
      ...standardDefinitions,
      {
        kind: "metric",
        name: "Average Order Value",
        description: "Average dollar value per order.",
        expression: "AVG(orders.amount)",
        aliases: ["aov"],
      },
    ];

    const result = compileASTtoMQL("Average Order Value", "Customer Region", customDefs);
    expect(result.targetCollection).toBe("orders");
    expect(result.columns).toEqual(["Region", "Average Order Value"]);

    const groupStage = result.mql.find(s => s.$group);
    expect(groupStage.$group.average_order_value).toEqual({ $avg: { $toDouble: "$amount" } });

    expect(validateMQL(result.mql).ok).toBe(true);
  });

  it("compiles dynamic COUNT metric expression", () => {
    const customDefs = [
      ...standardDefinitions,
      {
        kind: "metric",
        name: "Total Orders",
        description: "Count of all order transactions.",
        expression: "COUNT(orders.order_id)",
        aliases: ["order count"],
      },
    ];

    const result = compileASTtoMQL("Total Orders", "Customer Region", customDefs);
    expect(result.columns).toEqual(["Region", "Total Orders"]);

    const groupStage = result.mql.find(s => s.$group);
    expect(groupStage.$group.total_orders).toEqual({ $sum: 1 });

    expect(validateMQL(result.mql).ok).toBe(true);
  });

  it("compiles MIN and MAX metric expressions", () => {
    const minDef = [{ kind: "metric", name: "Min Amount", expression: "MIN(orders.amount)" }];
    const maxDef = [{ kind: "metric", name: "Max Amount", expression: "MAX(orders.amount)" }];

    const minResult = compileASTtoMQL("Min Amount", undefined, minDef);
    expect(minResult.mql.find(s => s.$group).$group.min_amount).toEqual({ $min: { $toDouble: "$amount" } });
    expect(validateMQL(minResult.mql).ok).toBe(true);

    const maxResult = compileASTtoMQL("Max Amount", undefined, maxDef);
    expect(maxResult.mql.find(s => s.$group).$group.max_amount).toEqual({ $max: { $toDouble: "$amount" } });
    expect(validateMQL(maxResult.mql).ok).toBe(true);
  });

  it("compiles dynamic uploaded dataset collections and handles same-collection aggregation", () => {
    const datasetDefs = [
      {
        kind: "metric",
        name: "Sales Dataset · Total Value",
        description: "Total invoice value in sales dataset",
        expression: "dataset_sales2026.invoice_total",
      },
      {
        kind: "dimension",
        name: "Sales Dataset · Category",
        description: "Product category",
        expression: "dataset_sales2026.product_category",
      },
    ];

    const result = compileASTtoMQL("Sales Dataset · Total Value", "Sales Dataset · Category", datasetDefs);
    expect(result.targetCollection).toBe("dataset_sales2026");
    expect(result.columns).toEqual(["Category", "Total Value"]);

    // No lookup needed for same-collection aggregation
    expect(result.mql.some(s => s.$lookup)).toBe(false);

    const groupStage = result.mql.find(s => s.$group);
    expect(groupStage.$group._id).toBe("$productCategory");
    expect(groupStage.$group.total_value).toEqual({ $sum: { $toDouble: "$invoiceTotal" } });

    expect(validateMQL(result.mql).ok).toBe(true);
  });

  it("compiles cross-collection dataset join using custom relationship definition", () => {
    const customRelDefs = [
      {
        kind: "metric",
        name: "Transactions · Total Amount",
        expression: "dataset_transactions.amount",
      },
      {
        kind: "dimension",
        name: "Customers · Tier",
        expression: "dataset_customers.loyalty_tier",
      },
      {
        kind: "relationship",
        name: "Transactions linked to Customers",
        expression: "dataset_transactions.cust_id = dataset_customers.user_id",
      },
    ];

    const result = compileASTtoMQL("Transactions · Total Amount", "Customers · Tier", customRelDefs);
    expect(result.targetCollection).toBe("dataset_transactions");
    expect(result.columns).toEqual(["Tier", "Total Amount"]);

    const lookupStage = result.mql.find(s => s.$lookup);
    expect(lookupStage).toBeDefined();
    expect(lookupStage.$lookup.from).toBe("dataset_customers");
    expect(lookupStage.$lookup.localField).toBe("custId");
    expect(lookupStage.$lookup.foreignField).toBe("userId");

    const unwindStage = result.mql.find(s => s.$unwind);
    expect(unwindStage).toBeDefined();

    expect(validateMQL(result.mql).ok).toBe(true);
  });

  it("compiles scalar aggregate with no dimension", () => {
    const result = compileASTtoMQL("Completed Revenue", undefined, standardDefinitions);
    expect(result.columns).toEqual(["Revenue"]);

    const groupStage = result.mql.find(s => s.$group);
    expect(groupStage.$group._id).toBeNull();
    expect(groupStage.$group.revenue).toEqual({ $sum: { $toDouble: "$amount" } });

    expect(validateMQL(result.mql).ok).toBe(true);
  });
});
