import { describe, it, expect, vi } from "vitest";
import { answerBusinessQuestion } from "./datasetEngine.js";

// ============================================================
// M4: AI Chatbot Accuracy Test Suite
// Tests that the chatbot:
//   1. Responds helpfully to greetings (uses quickReply fast path, no LLM call)
//   2. Admits when no data is uploaded rather than hallucinating
//   3. Explains finance terms correctly
//   4. Does not expose internal reasoning (<think> blocks)
//   5. Does not output raw SQL/JSON/aggregation operators in responses
// ============================================================

const userMsg = (content: string) => ({ role: "user" as const, content });
const assistantMsg = (content: string) => ({ role: "assistant" as const, content });

// Accuracy tests that require a live LLM key run as integration tests.
// They are skipped automatically in the local CI environment where no API key is set.
const hasApiKey = Boolean(process.env.OPENAI_API_KEY ?? process.env.GROQ_API_KEY);

describe("AI Chatbot Accuracy", () => {
  it("responds to a greeting without calling LLM (quickReply fast path)", async () => {
    // This test does NOT require an API key — it uses the hardcoded quickReply shortcut.
    const response = await answerBusinessQuestion([userMsg("hi")]);

    // Must not leak internal reasoning at all
    expect(response).not.toContain("<think>");
    expect(response).not.toContain("</think>");
    expect(response).not.toContain("Analyze the Request");
    expect(response).not.toContain("Chain of Thought");
    expect(response).not.toContain("Self-Correction");
    expect(response).not.toContain("Drafting:");

    // Must be a non-empty helpful string
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(5);
    expect(response.length).toBeLessThan(2000);
  }, 10000);

  it.skipIf(!hasApiKey)("does not hallucinate data when no dataset is uploaded", async () => {
    const response = await answerBusinessQuestion([
      userMsg("What was the total revenue last quarter?")
    ]);

    // Should NOT invent dollar amounts
    expect(response).not.toMatch(/\$[0-9,]+/);

    // Must acknowledge missing data in some form
    const acknowledgesMissingData =
      response.toLowerCase().includes("upload") ||
      response.toLowerCase().includes("no dataset") ||
      response.toLowerCase().includes("no data") ||
      response.toLowerCase().includes("missing") ||
      response.toLowerCase().includes("not available") ||
      response.toLowerCase().includes("don't have") ||
      response.toLowerCase().includes("haven't");

    expect(acknowledgesMissingData).toBe(true);
    expect(response).not.toContain("<think>");
  }, 25000);

  it.skipIf(!hasApiKey)("explains a finance term when asked (EBITDA)", async () => {
    const response = await answerBusinessQuestion([
      userMsg("What does EBITDA mean?")
    ]);

    // Should contain at least one of these relevant terms
    const containsRelevantContent =
      response.toLowerCase().includes("earnings") ||
      response.toLowerCase().includes("interest") ||
      response.toLowerCase().includes("tax") ||
      response.toLowerCase().includes("depreciation") ||
      response.toLowerCase().includes("amortization");

    expect(containsRelevantContent).toBe(true);

    // Must not leak internal reasoning
    expect(response).not.toContain("<think>");
    expect(response).not.toContain("</think>");

    // Must not be raw SQL
    expect(response).not.toMatch(/^SELECT /i);
  }, 25000);

  it.skipIf(!hasApiKey)("does not expose MongoDB aggregation operators in responses", async () => {
    const response = await answerBusinessQuestion([
      userMsg("What is gross margin?")
    ]);

    expect(response).not.toContain("<think>");
    expect(response).not.toContain("\$match");
    expect(response).not.toContain("\$group");
    expect(response).not.toContain("\$aggregate");
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(10);
  }, 25000);

  it.skipIf(!hasApiKey)("maintains conversation context across multiple messages", async () => {
    const messages = [
      userMsg("What is working capital?"),
      assistantMsg("Working capital is the difference between a company's current assets and current liabilities."),
      userMsg("Can you give me an example of that?")
    ];

    const response = await answerBusinessQuestion(messages);

    const isContextual =
      response.toLowerCase().includes("current") ||
      response.toLowerCase().includes("assets") ||
      response.toLowerCase().includes("liabilities") ||
      response.toLowerCase().includes("working capital") ||
      response.toLowerCase().includes("example") ||
      response.toLowerCase().includes("for instance");

    expect(isContextual).toBe(true);
    expect(response).not.toContain("<think>");
    expect(response.length).toBeGreaterThan(10);
  }, 25000);
});
