const ALLOWED_STAGES = new Set(["$match", "$lookup", "$unwind", "$group", "$project", "$sort", "$limit"]);
const ALLOWED_LOOKUP_COLLECTIONS = new Set(["customers", "orders"]);
const MAX_STAGES = 12;
const MAX_LIMIT = 1000;

export function validateMQL(pipeline: unknown): { ok: boolean; errors?: string[] } {
  if (!Array.isArray(pipeline)) return { ok: false, errors: ["Pipeline must be an array."] };
  const errors: string[] = [];
  if (pipeline.length === 0 || pipeline.length > MAX_STAGES) errors.push(`Pipeline must contain between 1 and ${MAX_STAGES} stages.`);

  for (let index = 0; index < pipeline.length; index += 1) {
    const stage = pipeline[index];
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
      errors.push(`Stage ${index + 1} must be an object.`);
      continue;
    }
    const keys = Object.keys(stage);
    if (keys.length !== 1) {
      errors.push(`Stage ${index + 1} must contain exactly one operator.`);
      continue;
    }
    const stageName = keys[0];
    if (!stageName || !ALLOWED_STAGES.has(stageName)) {
      errors.push(`Forbidden aggregation stage detected: ${stageName || "unknown"}.`);
      continue;
    }
    const stageValue = (stage as Record<string, unknown>)[stageName];
    if (stageName === "$limit" && (typeof stageValue !== "number" || !Number.isInteger(stageValue) || stageValue < 1 || stageValue > MAX_LIMIT)) {
      errors.push(`$limit must be an integer between 1 and ${MAX_LIMIT}.`);
    }
    if (stageName === "$lookup" && stageValue && typeof stageValue === "object" && !Array.isArray(stageValue)) {
      const from = (stageValue as Record<string, unknown>).from;
      if (typeof from !== "string" || !ALLOWED_LOOKUP_COLLECTIONS.has(from)) errors.push("$lookup collection is not approved.");
      if (Object.keys(stageValue as object).some(key => !["from", "localField", "foreignField", "as"].includes(key))) errors.push("$lookup may only use simple equality joins.");
    }
    const serialized = JSON.stringify(stage);
    if (serialized.includes("$function") || serialized.includes("$where") || serialized.includes("$accumulator") || serialized.includes("$out") || serialized.includes("$merge") || serialized.includes("$unionWith")) {
      errors.push(`Stage ${index + 1} contains a forbidden expression.`);
    }
  }

  return { ok: errors.length === 0, errors: errors.length ? errors : undefined };
}
