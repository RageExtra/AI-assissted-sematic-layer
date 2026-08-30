export function compileASTtoMQL(metric?: string, dimension?: string): { mql: any[], columns: string[] } {
  const mql: any[] = [];
  const columns: string[] = [];
  
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
  } else {
      // Default / fallback pipeline
      mql.push({ $limit: 10 });
      columns.push("orderId", "amount", "orderStatus");
  }

  return { mql, columns };
}
