import type { SemanticDefinition } from "../shared/governance";

export function validateInterpretation(
  data: any,
  availableDefinitions?: SemanticDefinition[]
): { ok: boolean; valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, valid: false, errors: ["Interpretation must be a JSON object."] };
  }

  // Dynamic metric validation
  if (data.metric !== undefined && data.metric !== null) {
    if (typeof data.metric !== "string") {
      errors.push(`Field "metric" must be a string.`);
    } else if (data.metric !== "Unresolved" && availableDefinitions && availableDefinitions.length > 0) {
      const metricLower = data.metric.toLowerCase().trim();
      const isApproved = availableDefinitions.some(def => {
        const nameMatch = def.name.toLowerCase().trim() === metricLower;
        const aliasMatch = (def.aliases || []).some(a => a.toLowerCase().trim() === metricLower);
        return nameMatch || aliasMatch;
      });
      if (!isApproved) {
        errors.push(`Invalid metric: "${data.metric}". Metric is not in the governed semantic catalog.`);
      }
    }
  }

  const checkDecimals = (obj: any, path: string = "") => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "number" && !Number.isInteger(value)) {
        errors.push(`Field "${path ? path + '.' : ''}${key}" is a floating-point number. Must be a decimal string or integer.`);
      } else if (typeof value === "string" && !isNaN(Number(value)) && value.trim() !== "") {
        const decimalRegex = /^-?\d+(\.\d+)?$/;
        if (!decimalRegex.test(value.trim())) {
          errors.push(`Field "${path ? path + '.' : ''}${key}" with value "${value}" does not conform to the Decimal string pattern (e.g. "100.00" or "100.5").`);
        }
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        checkDecimals(value, path ? `${path}.${key}` : key);
      }
    }
  };

  checkDecimals(data);

  return {
    ok: errors.length === 0,
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
