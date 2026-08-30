import { invokeLLM, listLLMModels } from "./_core/llm";
import type { SemanticDefinition } from "../shared/governance";

export async function mapSemanticDefinitions(schemaSql: string): Promise<Omit<SemanticDefinition, "id" | "updatedAt">[]> {
  try {
    const models = await listLLMModels();
    const model = models.data.find((m) => m.id === "gpt-5-mini" || m.id.includes("gpt-4")) ?? models.data[0];
    if (!model) throw new Error("No LLM available for semantic mapping.");

    const systemPrompt = `You are a Chief Data Officer and Semantic Layer architect specializing in Business and Finance. 
Given a schema, you must infer the core business definitions (Entities, Metrics, Dimensions, and Relationships) with 100% financial accuracy. 
- Never guess on ambiguous metrics. 
- Ensure currency metrics strictly account for refunds, cancellations, and tax if the schema supports it.
- Use exact business terminology (e.g., EBITDA, Gross Margin, Net Revenue).
Output a JSON array of definitions adhering to the following structure:
[
  {
    "kind": "metric" | "dimension" | "entity" | "relationship",
    "name": string (Display name),
    "description": string (Business description),
    "expression": string (SQL expression or column path),
    "aliases": string[] (Alternate business terms),
    "evidence": string[] (Why you chose this, columns used)
  }
]
Infer realistic and robust definitions. For metrics, use standard aggregation functions (e.g. SUM(), COUNT()).`;

    const response = await invokeLLM({
      model: model.id,
      maxTokens: 2500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate semantic definitions for this schema:\n\n${schemaSql}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "semantic_definitions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              definitions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    kind: { type: "string", enum: ["metric", "dimension", "entity", "relationship", "policy"] },
                    name: { type: "string" },
                    description: { type: "string" },
                    expression: { type: "string" },
                    aliases: { type: "array", items: { type: "string" } },
                    evidence: { type: "array", items: { type: "string" } },
                  },
                  required: ["kind", "name", "description", "expression", "aliases", "evidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["definitions"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message.content;
    if (typeof content !== "string") {
      throw new Error("Failed to map semantic definitions: Invalid format.");
    }

    const result = JSON.parse(content) as {
      definitions: Array<{
        kind: "metric" | "dimension" | "entity" | "relationship" | "policy";
        name: string;
        description: string;
        expression: string;
        aliases: string[];
        evidence: string[];
      }>;
    };

    return result.definitions.map(def => ({
      ...def,
      status: "pending_review",
      version: 1,
      rationale: "Automatically inferred by Semantic Mapper LLM.",
    }));
  } catch (error) {
    console.error("[SemanticMapper] Failed to map definitions:", error);
    throw error;
  }
}
