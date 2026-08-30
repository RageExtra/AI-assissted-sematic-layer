const ALLOWED_STAGES = new Set(["$match", "$group", "$project", "$sort", "$limit", "$skip", "$unwind", "$lookup", "$addFields"]);

export function validateMQL(pipeline: any[]): { ok: boolean; errors?: string[] } {
  if (!Array.isArray(pipeline)) {
    return { ok: false, errors: ["Pipeline must be an array."] };
  }

  const errors: string[] = [];

  for (const stage of pipeline) {
    if (typeof stage !== "object" || stage === null) continue;
    const stageName = Object.keys(stage)[0];
    if (!ALLOWED_STAGES.has(stageName)) {
      errors.push("Forbidden aggregation stage detected: " + stageName);
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
