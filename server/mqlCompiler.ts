export type CompiledMQLResult = {
  mql: any[];
  columns: string[];
  targetCollection: string;
};

function toCamelOrOriginal(field: string): string {
  if (field.includes("_")) {
    return field.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  }
  return field;
}

function parseExpression(expr: string) {
  let filter: { field: string; value: string } | null = null;
  let cleanExpr = expr;

  const whereMatch = expr.match(/\bWHERE\s+([a-zA-Z0-9_.]+)\s*=\s*['"]?([^'"]+?)['"]?(?:\s|$)/i);
  if (whereMatch) {
    const rawFilterField = whereMatch[1].includes(".") ? whereMatch[1].split(".")[1] : whereMatch[1];
    filter = {
      field: toCamelOrOriginal(rawFilterField),
      value: whereMatch[2].trim(),
    };
    cleanExpr = expr.replace(/\bWHERE\s+.*$/i, "").trim();
  }

  const funcMatch = cleanExpr.match(/^(SUM|AVG|COUNT|MIN|MAX)\s*\(\s*([^)]+)\s*\)/i);
  let op: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" = "SUM";
  let targetField = cleanExpr;

  if (funcMatch) {
    op = funcMatch[1].toUpperCase() as "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";
    targetField = funcMatch[2].trim();
  }

  let collection = "orders";
  let field = targetField;
  if (targetField.includes(".")) {
    const parts = targetField.split(".");
    collection = parts[0];
    field = parts[1];
  }

  return {
    op,
    collection,
    field: toCamelOrOriginal(field),
    rawField: field,
    filter,
  };
}

function parseDimension(dimName?: string, definitions: any[] = []) {
  if (!dimName || dimName === "Unresolved") return null;

  const dimDef = definitions.find(d =>
    d?.name === dimName ||
    (d?.aliases && Array.isArray(d.aliases) && d.aliases.some((a: string) => a.toLowerCase() === dimName.toLowerCase()))
  );

  let expr = dimDef?.expression || "";
  if (!expr) {
    if (dimName === "Customer Region" || dimName.toLowerCase() === "region") expr = "customers.region";
    else if (dimName === "Customer" || dimName.toLowerCase() === "customer") expr = "customers.customerName";
    else if (dimName === "Month" || dimName.toLowerCase() === "month") expr = "orders.orderDate";
    else expr = dimName;
  }

  let collection = "";
  let field = expr;
  if (expr.includes(".")) {
    const parts = expr.split(".");
    collection = parts[0];
    field = parts[1];
  }

  const isMonth = dimName.toLowerCase().includes("month") || field.toLowerCase().includes("month") || Boolean(dimDef?.name?.toLowerCase().includes("month"));
  const isDate = isMonth || field.toLowerCase().includes("date") || Boolean(dimDef?.name.toLowerCase().includes("date"));

  let label = dimDef?.name || dimName;
  if (label.includes("·")) label = label.split("·")[1].trim();
  if (dimName === "Customer Region") label = "Region";

  return {
    name: dimName,
    def: dimDef,
    collection,
    field: toCamelOrOriginal(field),
    rawField: field,
    isMonth,
    isDate,
    label,
  };
}

function findRelationship(targetColl: string, foreignColl: string, definitions: any[]) {
  const relDef = definitions.find(d =>
    d?.kind === "relationship" &&
    typeof d.expression === "string" &&
    d.expression.includes(targetColl) &&
    d.expression.includes(foreignColl)
  );

  if (relDef && relDef.expression.includes("=")) {
    const [sideA, sideB] = relDef.expression.split("=").map((s: string) => s.trim());
    const [collA, fieldA] = sideA.split(".");
    const [collB, fieldB] = sideB.split(".");

    if (collA === targetColl && collB === foreignColl) {
      return {
        localField: toCamelOrOriginal(fieldA),
        foreignField: toCamelOrOriginal(fieldB),
        as: foreignColl === "customers" ? "customer" : `joined_${foreignColl}`,
      };
    } else if (collB === targetColl && collA === foreignColl) {
      return {
        localField: toCamelOrOriginal(fieldB),
        foreignField: toCamelOrOriginal(fieldA),
        as: foreignColl === "customers" ? "customer" : `joined_${foreignColl}`,
      };
    }
  }

  if (
    (targetColl === "orders" && foreignColl === "customers") ||
    (targetColl === "customers" && foreignColl === "orders")
  ) {
    return {
      localField: "customerId",
      foreignField: "customerId",
      as: foreignColl === "customers" ? "customer" : `joined_${foreignColl}`,
    };
  }

  return {
    localField: `${foreignColl}Id`,
    foreignField: "id",
    as: `joined_${foreignColl}`,
  };
}

export function compileASTtoMQL(
  metric?: string,
  dimension?: string,
  definitions: any[] = []
): CompiledMQLResult {
  const mql: any[] = [];
  const columns: string[] = [];

  const metricDef = definitions.find(d =>
    d?.name === metric ||
    (d?.aliases && Array.isArray(d.aliases) && d.aliases.some((a: string) => a.toLowerCase() === (metric || "").toLowerCase()))
  );

  let metricExpr = metricDef?.expression || "";
  if (!metricExpr) {
    if (metric === "Completed Revenue" || !metric) {
      metricExpr = "SUM(orders.amount) WHERE orders.orderStatus = 'completed'";
    } else {
      metricExpr = metric;
    }
  }

  const parsedMetric = parseExpression(metricExpr);
  const targetCollection = parsedMetric.collection || "orders";

  let cleanMetricLabel = metricDef?.name || metric || (!metric ? "Revenue" : "Value");
  if (cleanMetricLabel.includes("·")) cleanMetricLabel = cleanMetricLabel.split("·")[1].trim();
  if (metric === "Completed Revenue") cleanMetricLabel = "Revenue";

  const metricKey = cleanMetricLabel.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

  if (parsedMetric.filter) {
    mql.push({
      $match: {
        [parsedMetric.filter.field]: parsedMetric.filter.value,
      },
    });
  }

  const parsedDim = parseDimension(dimension, definitions);

  if (parsedDim) {
    const dimCollection = parsedDim.collection || targetCollection;
    let dimFieldPath = parsedDim.field;

    if (dimCollection !== targetCollection) {
      const rel = findRelationship(targetCollection, dimCollection, definitions);
      mql.push({
        $lookup: {
          from: dimCollection,
          localField: rel.localField,
          foreignField: rel.foreignField,
          as: rel.as,
        },
      });
      mql.push({
        $unwind: `$${rel.as}`,
      });
      dimFieldPath = `${rel.as}.${parsedDim.field}`;
    }

    let groupId: any = `$${dimFieldPath}`;
    if (parsedDim.isMonth) {
      groupId = { $substrCP: [`$${dimFieldPath}`, 0, 7] };
    }

    let accumValue: any;
    if (parsedMetric.op === "COUNT") {
      accumValue = { $sum: 1 };
    } else if (parsedMetric.op === "AVG") {
      accumValue = { $avg: { $toDouble: `$${parsedMetric.field}` } };
    } else if (parsedMetric.op === "MIN") {
      accumValue = { $min: { $toDouble: `$${parsedMetric.field}` } };
    } else if (parsedMetric.op === "MAX") {
      accumValue = { $max: { $toDouble: `$${parsedMetric.field}` } };
    } else {
      accumValue = { $sum: { $toDouble: `$${parsedMetric.field}` } };
    }

    mql.push({
      $group: {
        _id: groupId,
        [metricKey]: accumValue,
      },
    });

    mql.push({
      $project: {
        _id: 0,
        [parsedDim.label]: "$_id",
        [cleanMetricLabel]: `$${metricKey}`,
      },
    });

    mql.push({
      $sort: {
        [cleanMetricLabel]: -1,
      },
    });

    mql.push({
      $limit: 100,
    });

    columns.push(parsedDim.label, cleanMetricLabel);
  } else {
    let accumValue: any;
    if (parsedMetric.op === "COUNT") {
      accumValue = { $sum: 1 };
    } else if (parsedMetric.op === "AVG") {
      accumValue = { $avg: { $toDouble: `$${parsedMetric.field}` } };
    } else if (parsedMetric.op === "MIN") {
      accumValue = { $min: { $toDouble: `$${parsedMetric.field}` } };
    } else if (parsedMetric.op === "MAX") {
      accumValue = { $max: { $toDouble: `$${parsedMetric.field}` } };
    } else {
      accumValue = { $sum: { $toDouble: `$${parsedMetric.field}` } };
    }

    mql.push({
      $group: {
        _id: null,
        [metricKey]: accumValue,
      },
    });

    mql.push({
      $project: {
        _id: 0,
        [cleanMetricLabel]: `$${metricKey}`,
      },
    });

    columns.push(cleanMetricLabel);
  }

  return { mql, columns, targetCollection };
}
