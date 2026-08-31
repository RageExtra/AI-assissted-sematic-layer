import { getDb } from "./db.js";
import { invokeLLM } from "./_core/llm.js";

function validateMqlPipeline(pipeline: any[]): { valid: boolean; error?: string } {
  if (!Array.isArray(pipeline)) return { valid: false, error: "Pipeline must be an array." };
  if (pipeline.length > 10) return { valid: false, error: "Pipeline is too complex (max 10 stages)." };
  
  const forbiddenStages = ["$out", "$merge", "$lookup", "$indexStats", "$planCacheStats", "$collStats", "$currentOp"];
  for (const stage of pipeline) {
    const keys = Object.keys(stage);
    if (keys.length !== 1) return { valid: false, error: "Invalid stage format." };
    const operator = keys[0];
    if (forbiddenStages.includes(operator)) return { valid: false, error: `Stage ${operator} is forbidden for read-only queries.` };
    
    // Enforce limits
    if (operator === "$limit") {
      if (typeof stage[operator] !== "number" || stage[operator] > 100) {
        return { valid: false, error: "Limit must be a number <= 100." };
      }
    }
  }
  
  // Ensure the pipeline ends with a limit if not present (soft enforcement)
  const hasLimit = pipeline.some(stage => Object.keys(stage)[0] === "$limit");
  if (!hasLimit) {
    pipeline.push({ $limit: 100 });
  }

  return { valid: true };
}

export async function generateAndExecuteMql(question: string, catalogContext: string, kgContext: string): Promise<string> {
  const system = `You are a MongoDB MQL generator.
Based on the user's question, the provided catalog schema, and the knowledge graph, generate a valid MongoDB Aggregation Pipeline to query the dataset.
The collection name is implicitly the dataset collection.
Output ONLY a JSON object with a 'pipeline' array, and a 'collection' string (if you can infer it from the catalog). Do not output markdown code blocks. Just raw JSON.
If the question cannot be answered by MQL (e.g. general chat or asks about unstructured text), output {"pipeline": null}.`;

  const prompt = `Catalog/Schema:\n${catalogContext}\n\nKnowledge Graph:\n${kgContext}\n\nQuestion: ${question}\n\nGenerate JSON:`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    });
    
    let content = response.choices[0]?.message.content;
    if (Array.isArray(content)) content = JSON.stringify(content);
    content = (content || "").trim();
    // Clean up potential markdown formatting
    if (content.startsWith("\`\`\`json")) {
      content = content.replace(/^\`\`\`json/m, "").replace(/\`\`\`$/m, "").trim();
    } else if (content.startsWith("\`\`\`")) {
      content = content.replace(/^\`\`\`/m, "").replace(/\`\`\`$/m, "").trim();
    }
    
    const parsed = JSON.parse(content);
    if (!parsed.pipeline) return "No MQL generated (not applicable).";
    
    const validation = validateMqlPipeline(parsed.pipeline);
    if (!validation.valid) return `SQL/MQL Validation Failed: ${validation.error}`;
    
    // Execution
    const db = await getDb();
    if (!db) return "Database unavailable for execution.";
    
    let targetCollection = parsed.collection;
    if (!targetCollection) {
      // Find collection from datasets
      const datasets = await db.collection("uploadedDatasets").find({ status: "ready" }).toArray();
      if (datasets.length > 0) targetCollection = datasets[0].collectionName;
    }
    
    if (!targetCollection) return "No target collection identified.";
    
    const results = await db.collection(targetCollection).aggregate(parsed.pipeline).toArray();
    return `SQL/MQL Execution Success. Results: ${JSON.stringify(results.slice(0, 20))}`;
    
  } catch (error) {
    return `SQL/MQL Execution Error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}
