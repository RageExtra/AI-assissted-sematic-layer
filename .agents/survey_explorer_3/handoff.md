# Handoff Report — MQL, Semantic Pipeline, Execution & Test Suite Survey

**Author**: survey_explorer_3 (MQL & Semantic Pipeline Specialist)  
**Date**: 2026-09-01T03:14:00+05:30  
**Milestone**: Milestone 1 - Discovery & Codebase Survey  

---

## 1. Observation

### 1.1 Test Suite & Verification Baseline
- **TypeScript Check (`pnpm check` / `tsc --noEmit`)**:
  - Exited with status code `0`. No type errors across the project.
- **Vitest Test Suite (`pnpm test` / `vitest run`)**:
  - Exited with status code `0`.
  - 8 test files executed, 25 tests passed in ~8.44s:
    1. `server/auth.logout.test.ts` (1 test) — Session cookie clearance and options validation.
    2. `server/automation.test.ts` (4 tests) — Benchmark schedule staging, regression alert generation, schedule execution, steward role assignment.
    3. `server/evaluationImport.test.ts` (3 tests) — CSV and JSON evaluation dataset parsing and header validation.
    4. `server/governance.test.ts` (4 tests) — RBAC for viewers/editors/approvers, definition approval, evaluation execution and trend tracking.
    5. `server/mqlValidator.test.ts` (3 tests) — Allowed/forbidden aggregation stages (`$out`, `$unionWith`, `$function`, `$lookup`), limit constraints.
    6. `server/semantic.router.test.ts` (3 tests) — Typed tRPC API for `semantic.demo`, `semantic.history`, `semantic.run`.
    7. `server/semanticEngine.test.ts` (5 tests) — SQL safety checking, metric grounding, plural customer ranking resolution, ambiguity gate.
    8. `server/validation.test.ts` (2 tests) — Metric name checking and decimal string regex checking.
- **Test Infrastructure (`vitest.config.ts` & `vitest.setup.ts`)**:
  - `vitest.setup.ts` initializes an in-memory MongoDB server (`MongoMemoryServer.create()`) and sets `process.env.MONGODB_URI` and `process.env.DATABASE_URL` for isolated test runs.

---

### 1.2 MQL & Semantic Pipeline Architecture
The system employs a dual-path architecture combining structured Semantic Layer MQL generation with an unstructured document RAG & conversational assistant:

1. **Semantic Layer Definition & Storage (`server/db.ts`, `server/governance.ts`, `shared/governance.ts`)**:
   - `SemanticDefinition` stores entities, metrics, dimensions, relationships, and policies with versioning, aliases, and audit history (`definitionEvents`).
   - Default seeded definitions in `server/governance.ts:6-19`:
     - Metric: `"Completed Revenue"` (`SUM(orders.amount) WHERE orders.order_status = 'completed'`)
     - Dimension: `"Customer Region"` (`customers.region`)
     - Relationship: `"Customer places Order"` (`customers.customer_id = orders.customer_id`)
     - Policy: `"Read-only Query Envelope"`
   - Dynamic schema discovery from PostgreSQL data sources via `server/warehouseDiscovery.ts` (`information_schema.columns`) and auto-generation via `server/autoGenerate.ts` + `server/semanticMapper.ts`.

2. **Query Interpretation & AST Generation (`server/semanticEngine.ts`)**:
   - `buildSemanticQuery(question, useLlm, executeDemo)`:
     - **Caching**: `getCachedQuery(question)` / `cacheQuery(question, llm)` in `server/cache.ts` (`queryCache` collection).
     - **Definition Retrieval**: `getRelevantDefinitions(question)` matches keywords ("revenue", "customer", or tokens > 3 chars).
     - **LLM Interpretation**: `interpretWithLLM(question)` sends prompt with definitions context to LLM (`json_schema` response format) to extract `{ intent, entities, metric, dimension, ambiguity, note }`.
     - **Auto-Governance**: If `intent === "propose_definition"`, calls `createDraftDefinition` to log orphan intents for Data Steward approval.

3. **MQL Aggregation Compilation (`server/mqlCompiler.ts`)**:
   - `compileASTtoMQL(metric, dimension, definitions)`:
     - Compiles the AST into MongoDB Aggregation Pipeline stages (`$match`, `$lookup`, `$unwind`, `$group`, `$project`, `$sort`).
     - Hardcoded paths for `"Completed Revenue"` + `"Customer Region"` (group by `$customer.region`, sum `$amount`), `"Customer"` (group by `$customer.customerName`, sum `$amount`), and total revenue.
     - Dynamic fallback parses `metricDef.expression` and `dimDef.expression` using `.` split (`collection.field`) to generate dynamic `$group` and `$project`.

4. **MQL Security & Validation (`server/mqlValidator.ts`)**:
   - `validateMQL(pipeline)`:
     - Enforces stage whitelist: `ALLOWED_STAGES = Set(["$match", "$lookup", "$unwind", "$group", "$project", "$sort", "$limit"])`.
     - Whitelists lookup target collections: `ALLOWED_LOOKUP_COLLECTIONS = Set(["customers", "orders"])`.
     - Enforces pipeline length (1 to 12 stages) and limit bounds (1 to 1,000).
     - Rejects forbidden code/injection stages: `$function`, `$where`, `$accumulator`, `$out`, `$merge`, `$unionWith`.

5. **Execution & Self-Correction (`server/semanticEngine.ts`)**:
   - `executeGovernedDemoQuery(template, safety, llm)`:
     - Runs `validateMQL(llm.mql)`.
     - Executes against MongoDB: `db.collection(targetCollection).aggregate(llm.mql).toArray()`.
     - Formats results with compact currency formatting (`$1.12M`, `$286K`, etc.) and column extraction.
     - Fallback mechanism: If LLM is unavailable or fails validation, catches errors in `interpretWithLLM` (`server/semanticEngine.ts:358`) and falls back to deterministic rule-based template dispatch via `chooseTemplate(question)`.

6. **Unstructured RAG & Conversational Assistant (`server/datasetEngine.ts` & `server/semanticEngine.ts`)**:
   - Document upload (`server/semanticEngine.ts:handleDocumentUpload`): Supports PDF (`pdf-parse`), DOCX (`mammoth`), Excel/CSV (`xlsx`), and text formats.
   - Text chunking (900–1,200 chars) + embeddings via Xenova transformers (`Xenova/all-MiniLM-L6-v2`) with lexical hash fallback (`server/semanticEngine.ts:607-624`).
   - Ingestion stored in `unstructured_docs` collection with text search index and cosine similarity ranking.
   - `datasetEngine.ts:answerBusinessQuestion` and `datasetEngine.ts:streamBusinessQuestion`: Injects combined catalog context, retrieved tabular dataset documents, and unstructured document chunks into LLM prompt with anti-hallucination constraints and conversational history (`searchContext`).

---

### 1.3 Concrete Bugs, Inconsistencies & Flaws Identified

1. **Severe Validation Bug in `server/validation.ts:9-11`**:
   ```ts
   // Enforce metric constraint
   if (data.metric && data.metric !== "Completed Revenue" && data.metric !== "Unresolved") {
     errors.push(`Invalid metric: "${data.metric}". Must be "Completed Revenue".`);
   }
   ```
   - **Impact**: Any valid metric other than `"Completed Revenue"` (such as newly auto-generated metrics from uploaded datasets or custom defined metrics) immediately fails validation at `semanticEngine.ts:342`, forcing the engine into a fallback clarification state.

2. **Overly Restrictive Decimal String Regex in `server/validation.ts:18-21`**:
   ```ts
   const decimalRegex = /^-?\d+(\.\d{2})?$/;
   if (!decimalRegex.test(value)) {
     errors.push(`Field "${path ? path + '.' : ''}${key}" with value "${value}" does not conform to the exact Decimal string pattern (e.g. "100.00").`);
   }
   ```
   - **Impact**: Rejects any valid numeric strings with single-digit decimals (e.g., `"10.5"`), integer numeric strings with leading zeros, or standard non-2-decimal precision strings.

3. **Orphaned & Conflicting `server/mqlEngine.ts`**:
   - `server/mqlEngine.ts` contains a duplicate, conflicting `validateMqlPipeline` function that explicitly **forbids `$lookup`** (`forbiddenStages = ["$out", "$merge", "$lookup", ...]`), contradicts `server/mqlValidator.ts` (which permits `$lookup`), has a lower stage limit (10 vs 12), and max limit (100 vs 1000).
   - `mqlEngine.ts` is never used by `semanticEngine.ts` or `routers.ts` (only imported in `datasetEngine.ts` as an unused dead import).

4. **Orphaned `server/knowledgeGraph.ts`**:
   - Contains `insertKnowledgeGraphEdges` and `searchKnowledgeGraph` which are imported by `datasetEngine.ts` as unused dead imports and never called.

5. **Duplicate / Redundant Dataset Ingestion**:
   - `server/semanticEngine.ts:552-603` has `handleDatasetUpload` which inserts raw data and creates basic definitions.
   - `server/datasetEngine.ts:113-191` has `processDatasetUpload` / `queueDatasetIngestion` which provides full schema profiling, type inference, job status tracking, and document indexing.
   - The tRPC router in `server/routers.ts:73` uses `datasetEngine.ts`, leaving `handleDatasetUpload` in `semanticEngine.ts` dead.

6. **Hidden BOM (Byte Order Mark `\uFEFF`) Characters in `server/semanticEngine.ts`**:
   - Lines 550 and 605 contain invisible zero-width no-break space characters (`\uFEFF`) that cause linting and parsing irregularities.

7. **Duplicated Vector Embedding Logic**:
   - `server/_core/vector.ts` defines `generateEmbedding` and `cosineSimilarity` using a quantized MiniLM pipeline.
   - `server/semanticEngine.ts:607-637` re-defines `embedText` and `cosineSimilarity` separately instead of reusing `_core/vector.ts`.

8. **Commented-Out Baseline Evaluation in `server/governance.ts:102-109`**:
   - Baseline query evaluation was disabled during MongoDB migration, resulting in baseline pass rate always calculating as 0%.

---

### 1.4 Dead Code & Temporary Files Inventory (42+ Files in Root)
The root workspace is cluttered with leftover migration/patch scripts:
- **Patch scripts**: `patch-*.cjs` (24 files), `patch1.cjs` through `patch6.cjs`, `patch_*.cjs` (10 files)
- **Utility scripts**: `append-clean.cjs`, `check-db.cjs`, `check-db.ts`, `curl_test.cjs`, `fix-bom.cjs`, `remove-broken.cjs`, `update-zod.cjs`
- **Ad-hoc test/temp files**: `test-chat.ts`, `test-vector.ts`, `test_pdf.cjs`, `test_pdf2.cjs`, `streamBusiness-add.ts`, `streamLLM-add.ts`, `Chat.backup.tsx`, `vite.config.ts.bak`, `todo.md`

---

## 2. Logic Chain

1. **Validation & Pipeline Consistency**:
   - The Semantic Layer's purpose is to ground natural language business queries into verified MQL pipelines.
   - Currently, `server/validation.ts` artificially restricts metrics to only `"Completed Revenue"`. In a production semantic layer with dynamic datasets and schema auto-generation, validation must check whether the metric exists in the active governed definitions catalog (`listDefinitions()` / `getRelevantDefinitions()`), rather than checking against a single hardcoded string.
   - Removing the hardcoded metric constraint and consolidating MQL validation into the authoritative `server/mqlValidator.ts` eliminates pipeline failure on dynamic datasets.

2. **MQL Compiler Dynamism & Safety**:
   - `server/mqlCompiler.ts` handles the demo ecommerce schema well, but its dynamic branch only supports simple single-collection groupings (`targetCollection.field`).
   - If a query requires joining customer dimension (`customers.region`) with orders metric (`orders.amount`), `compileASTtoMQL` needs robust relationship traversal via the approved semantic relationships (like `Customer places Order`).
   - `server/mqlValidator.ts` ensures that only read-only aggregation operators are executed, preventing injection attacks and unbounded query executions.

3. **AI Chatbot Accuracy & Evaluation Deficits**:
   - While `governance.test.ts` checks semantic score and SQL safety on 4 fixed evaluation cases, **zero tests exist** for evaluating the chatbot's conversational AI accuracy, RAG grounding, hallucination prevention, or multi-turn context retention.
   - To guarantee production reliability, an automated AI evaluation test suite must be established using deterministic/mocked LLM or rule-driven evaluation fixtures.

---

## 3. Caveats

1. **LLM API Key in Automated Tests**:
   - In CI/local testing environments without `OPENAI_API_KEY`, `server/_core/llm.ts` throws `"OPENAI_API_KEY is not configured"`.
   - The engine gracefully falls back to deterministic template matching (`chooseTemplate`), allowing existing tests to pass.
   - New AI accuracy test suites should include mocked LLM responses (or fixture-based testing) so they run deterministically in CI without requiring paid API credits.
2. **MongoDB In-Memory Footprint**:
   - `mongodb-memory-server` requires ~7 seconds during initial setup in `vitest.setup.ts`. Parallel test runs share the in-memory instance cleanly.

---

## 4. Conclusion & Action Plan

### Core Recommendations:

1. **Codebase Cleanup (R1)**:
   - Delete all root patch/temp scripts (`patch*.cjs`, `*.bak`, `test_*.cjs`, `check-db.*`, `Chat.backup.tsx`, etc.).
   - Remove dead server files: `server/mqlEngine.ts`, `server/knowledgeGraph.ts`.
   - Clean up duplicate `handleDatasetUpload` in `server/semanticEngine.ts` and remove BOM characters.
   - Standardize embedding logic onto `server/_core/vector.ts`.

2. **Pipeline Bug Fixing & Hardening (R2)**:
   - Refactor `server/validation.ts` to validate metrics and dimensions against dynamic semantic definitions instead of hardcoded `"Completed Revenue"`.
   - Fix string decimal validation to avoid false rejections on valid numbers.
   - Unify MQL validation strictly through `server/mqlValidator.ts`.

3. **AI Chatbot Accuracy Evaluation Suite (R3)**:
   - Create a dedicated test suite `server/aiAccuracy.test.ts` with automated evaluation for:
     - **Grounded Answering**: Verifying that responses only cite uploaded tabular/document data and refuse to hallucinate unprovided metrics.
     - **Disambiguation / Policy Refusal**: Verifying that ambiguous prompts trigger clarifying questions rather than false assumptions.
     - **Context Retention**: Verifying multi-turn history resolution (e.g., "What about APAC?" following a regional revenue question).
     - **RAG Document Grounding**: Verifying that uploaded text/PDF document content is accurately extracted and answered.
     - **Financial Calculation Exactness**: Verifying refund/cancellation exclusions and currency formatting.

---

## 5. Verification Method

To independently verify these findings:

1. **TypeScript Typecheck**:
   ```bash
   pnpm check
   ```
   *Expected: Exits with code 0.*

2. **Run Full Test Suite**:
   ```bash
   pnpm test
   ```
   *Expected: All 8 test files pass (25 tests).*

3. **Verify Dead Files**:
   Inspect root directory and `server/` to verify absence of consumers for `server/mqlEngine.ts`, `server/knowledgeGraph.ts`, and root `patch*.cjs` files.

4. **Verify Validation Metric Constraint**:
   Inspect `server/validation.ts:9-11` to observe the hardcoded `"Completed Revenue"` check.
