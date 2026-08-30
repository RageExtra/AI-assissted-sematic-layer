export function compileASTtoMQL(metric?: string, dimension?: string, definitions: any[] = []): { mql: any[], columns: string[], targetCollection: string } {
  const mql: any[] = [];
  const columns: string[] = [];
  let targetCollection = "orders";
  
  if (metric === "Completed Revenue") {
    mql.push({ $match: { orderStatus: "completed" } });
    
    if (dimension === "Customer Region") {
      mql.push({
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "customerId",
          as: "customer"
        }
      });
      mql.push({ $unwind: "$customer" });
      mql.push({
        $group: {
          _id: "$customer.region",
          revenue: { $sum: { $toDouble: "$amount" } }
        }
      });
      mql.push({ $project: { _id: 0, Region: "$_id", Revenue: "$revenue" } });
      mql.push({ $sort: { Revenue: -1 } });
      columns.push("Region", "Revenue");
    } else if (dimension === "Customer") {
      mql.push({
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "customerId",
          as: "customer"
        }
      });
      mql.push({ $unwind: "$customer" });
      mql.push({
        $group: {
          _id: "$customer.customerName",
          revenue: { $sum: { $toDouble: "$amount" } }
        }
      });
      mql.push({ $project: { _id: 0, Customer: "$_id", Revenue: "$revenue" } });
      mql.push({ $sort: { Revenue: -1 } });
      columns.push("Customer", "Revenue");
    } else {
      // Default: Total Revenue
      mql.push({
        $group: {
          _id: null,
          revenue: { $sum: { $toDouble: "$amount" } }
        }
      });
      mql.push({ $project: { _id: 0, Total_Revenue: "$revenue" } });
      columns.push("Total_Revenue");
    }
  } else if (metric && metric !== "Completed Revenue" && definitions.length > 0) {
    const metricDef = definitions.find((d) => d.name === metric);
    const dimDef = dimension ? definitions.find((d) => d.name === dimension) : null;
    
    if (metricDef && metricDef.expression && metricDef.expression.includes(".")) {
      const parts = metricDef.expression.split(".");
      targetCollection = parts[0];
      const colName = parts[1];
      
      if (dimDef && dimDef.expression && dimDef.expression.includes(".")) {
        const dimColName = dimDef.expression.split(".")[1];
        mql.push({
          $group: {
            _id: "$" + dimColName,
            [metric]: { $sum: { $toDouble: "$" + colName } }
          }
        });
        mql.push({ $project: { _id: 0, [dimension!]: "$_id", [metric]: 1 } });
        mql.push({ $sort: { [metric]: -1 } });
        columns.push(dimension!, metric);
      } else {
        mql.push({
          $group: {
            _id: null,
            [metric]: { $sum: { $toDouble: "$" + colName } }
          }
        });
        mql.push({ $project: { _id: 0, [metric]: 1 } });
        columns.push(metric);
      }
    } else {
      mql.push({ $limit: 10 });
      columns.push("id");
    }
  } else {
      // Default / fallback pipeline
      mql.push({ $limit: 10 });
      columns.push("orderId", "amount", "orderStatus");
  }

  return { mql, columns, targetCollection };
}
