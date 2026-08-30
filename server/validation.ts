export function validateInterpretation(data: any): { ok: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { ok: false, errors: ["Interpretation must be a JSON object."] };
  }

  // Enforce metric constraint
  if (data.metric && data.metric !== "Completed Revenue" && data.metric !== "Unresolved") {
    errors.push(`Invalid metric: "${data.metric}". Must be "Completed Revenue".`);
  }

  const checkDecimals = (obj: any, path: string = "") => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "number" && !Number.isInteger(value)) {
        errors.push(`Field "${path ? path + '.' : ''}${key}" is a floating-point number. Must be a decimal string or integer.`);
      } else if (typeof value === "string" && !isNaN(Number(value)) && value.trim() !== "") {
        const decimalRegex = /^-?\d+(\.\d{2})?$/;
        if (!decimalRegex.test(value)) {
          errors.push(`Field "${path ? path + '.' : ''}${key}" with value "${value}" does not conform to the exact Decimal string pattern (e.g. "100.00").`);
        }
      } else if (typeof value === "object" && value !== null) {
        checkDecimals(value, path ? `${path}.${key}` : key);
      }
    }
  };

  checkDecimals(data);

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
