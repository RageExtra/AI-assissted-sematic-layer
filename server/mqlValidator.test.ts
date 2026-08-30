import { describe, expect, it } from "vitest";
import { validateMQL } from "./mqlValidator";

describe("MQL validator", () => {
  it("accepts the compiler's bounded read-only stages", () => {
    const result = validateMQL([
      { $match: { orderStatus: "completed" } },
      { $lookup: { from: "customers", localField: "customerId", foreignField: "customerId", as: "customer" } },
      { $unwind: "$customer" },
      { $group: { _id: "$customer.region", revenue: { $sum: { $toDouble: "$amount" } } } },
      { $project: { _id: 0, Region: "$_id", Revenue: "$revenue" } },
      { $sort: { Revenue: -1 } },
      { $limit: 100 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects write, cross-collection, code, and malformed stages", () => {
    expect(validateMQL([{ $out: "sensitive_copy" }]).ok).toBe(false);
    expect(validateMQL([{ $unionWith: "secrets" }]).ok).toBe(false);
    expect(validateMQL([{ $project: { value: { $function: { body: "return 1" } } } }]).ok).toBe(false);
    expect(validateMQL([{ $lookup: { from: "secrets", localField: "id", foreignField: "id", as: "rows" } }]).ok).toBe(false);
    expect(validateMQL([null, { $limit: 10 }]).ok).toBe(false);
  });

  it("bounds result size", () => {
    expect(validateMQL([{ $limit: 1001 }]).ok).toBe(false);
    expect(validateMQL([{ $limit: 1000 }]).ok).toBe(true);
  });
});
