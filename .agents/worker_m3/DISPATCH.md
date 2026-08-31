## 2026-09-01T04:18:00Z
You are the implementation specialist for Milestone M3: Accuracy Maximization (R3).

Working Directory: d:/Semantic Layer/.agents/worker_m3
Project Root: d:/Semantic Layer

Read the authoritative requirements:
- `d:/Semantic Layer/.agents/ORIGINAL_REQUEST.md` (Mandatory - read first)
- `d:/Semantic Layer/PROJECT.md`
- `d:/Semantic Layer/.agents/survey_explorer_2/handoff.md`
- `d:/Semantic Layer/.agents/survey_explorer_3/handoff.md`
- `d:/Semantic Layer/.agents/worker_m2/handoff.md`

# MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

# Scope of Work for Milestone M3 (Features 14–16)
1. **Feature 14: Prompt Optimization, Grounding & Citations (`server/datasetEngine.ts`, `server/semanticEngine.ts`)**:
   - Refine system prompt instructions in `datasetEngine.ts` (`answerBusinessQuestion`, `streamBusinessQuestion`) and `semanticEngine.ts` (`interpretWithLLM`):
     - Explicitly instruct the model to ground all assertions strictly in the provided Context (Semantic Definitions, Ingested Tabular Rows/Schemas, and Unstructured Document Chunks).
     - Mandate citation of sources (e.g. `[Dataset: <title>]`, `[Document: <name>]`, `[Governed Metric: <name>]`).
     - Direct the model to refuse hallucination or unwarranted extrapolation when data is missing, and to ask focused clarifying questions if requirements are ambiguous.
     - Optimize prompt token layout and markdown readability for crisp, grounded answers.

2. **Feature 15: Dynamic MQL Compilation & Schema Joins (`server/mqlCompiler.ts`, `server/mqlValidator.ts`)**:
   - In `server/mqlCompiler.ts`:
     - Enhance `compileASTtoMQL(metric, dimension, definitions)`:
       - Parse dynamic metric expressions (such as `SUM(orders.amount)`, `AVG(orders.amount)`, `COUNT(orders.order_id)`) from `metricDef.expression` or AST.
       - Parse dimension field and collection from `dimDef.expression` (e.g. `customers.region`, `orders.status`).
       - If metric and dimension live in different collections (e.g. `orders` and `customers`), inspect `definitions` for an active `relationship` definition (e.g. `customers.customer_id = orders.customer_id`), and dynamically generate safe `$lookup` + `$unwind` stages linking the collections.
       - Ensure all compiled pipelines strictly pass `validateMQL(pipeline)` in `server/mqlValidator.ts`.
       - Add unit tests in `server/mqlValidator.test.ts` or a new `server/mqlCompiler.test.ts` to test dynamic compilation and relationship traversal.

3. **Feature 16: Execution Error Self-Correction & Ambiguity Handling (`server/semanticEngine.ts`, `server/datasetEngine.ts`)**:
   - In `server/semanticEngine.ts`:
     - When `interpretWithLLM` returns ambiguity (`ambiguity === "high"` or conflicting intents), produce clear, structured clarification guidance with suggested metrics/dimensions.
     - When MQL execution throws an error, catch it gracefully and provide informative error context or fall back to safe governed templates rather than crashing the request.
     - Ensure fallback paths maintain strict grounding.

4. **Verification**:
   - Run `pnpm check` to ensure 0 TypeScript errors.
   - Run `pnpm test` to verify all existing and new unit tests pass cleanly.
   - Run `pnpm build` to verify clean build.

5. **Handoff**:
   - Write a complete handoff report to `d:/Semantic Layer/.agents/worker_m3/handoff.md`.
   - Send a completion message to parent.
