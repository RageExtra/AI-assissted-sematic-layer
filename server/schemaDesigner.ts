import { invokeLLM, listLLMModels } from "./_core/llm";

export type SchemaDesignResult = {
  domain: string;
  collections: Array<{ name: string; jsonSchema: any; indexes?: any[] }>;
  explanation: string;
};

import Ajv from "ajv";

const ajv = new Ajv({ strict: false });

export async function designSchema(domain: string, retries = 2): Promise<SchemaDesignResult> {
  try {
    const models = await listLLMModels();
    const model = models.data.find((m) => m.id === "gpt-5-mini" || m.id.includes("gpt-4")) ?? models.data[0];
    if (!model) {
      throw new Error("No LLM model available for schema design.");
    }

    let systemPrompt = `You are an expert Enterprise Database Architect specializing in Corporate Finance and Business Operations.
The user will provide a business domain or application description.
Your job is to design a robust, 100% accurate, and normalized MongoDB database schema tailored for financial strictness and business reporting.
- Use precise types (e.g., Decimal128 or integer cents for currency, NEVER floats).
- Ensure audit trails (createdAt, updatedAt, createdBy) on critical tables.
- Define explicit relationships and constraints.
Output MUST be a JSON object containing:
- collections: An array where each element includes:
  - name: collection name string
  - jsonSchema: a JSON Schema object defining the document structure, required fields, types, etc. Ensure you use valid JSON schema types or BSON types.
  - indexes (optional): array of index specifications (field(s) and options).
- explanation: A brief explanation of the design decisions.
`;
    
    let attempt = 0;
    let lastError = "";

    while (attempt <= retries) {
      if (attempt > 0) {
         systemPrompt += `\n\nPrevious attempt failed with error: ${lastError}\nPlease fix the JSON schema to be valid according to draft-07 standard.`;
      }

      const response = await invokeLLM({
        model: model.id,
        maxTokens: 3000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Design a database schema for: ${domain}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "schema_design",
            strict: true,
            schema: {
              type: "object",
              properties: {
                collections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      jsonSchema: { type: "object", additionalProperties: true },
                      indexes: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: { type: "object", additionalProperties: true },
                            options: { type: "object", additionalProperties: true }
                          },
                          required: ["key"],
                          additionalProperties: true
                        }
                      }
                    },
                    required: ["name", "jsonSchema"],
                    additionalProperties: true
                  }
                },
                explanation: { type: "string" }
              },
              required: ["collections", "explanation"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message.content;
      if (typeof content !== "string") {
        throw new Error("Failed to generate schema: Invalid LLM response format.");
      }

      const result = JSON.parse(content) as { collections: any[]; explanation: string };
      
      // Validate all jsonSchemas using AJV
      let allValid = true;
      for (const col of result.collections) {
        try {
          ajv.compile(col.jsonSchema);
        } catch (e: any) {
          allValid = false;
          lastError = `Collection ${col.name} has invalid jsonSchema: ${e.message}`;
          break;
        }
      }

      if (allValid) {
        return {
          domain,
          collections: result.collections,
          explanation: result.explanation,
        };
      }
      
      attempt++;
    }
    throw new Error(`Failed to generate valid schema after ${retries} retries. Last error: ${lastError}`);
  } catch (error) {
    console.error("[SchemaDesigner] Failed to design schema:", error);
    throw error;
  }
}
