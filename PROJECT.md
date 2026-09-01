# Project: Semantic Layer Cleanup, Bug Squashing & Accuracy Maximization

## Architecture
The Semantic Layer is a full-stack platform integrating MongoDB, TypeScript, React 19, tRPC, and LLM-driven query engines.
- **Client (`client/src`)**: React 19 SPA with Tailwind CSS v4, wouter routing, tRPC client proxy, and streaming AI Chatbot (`AIChatBox.tsx`, `Chat.tsx`).
- **Server Core (`server/_core`)**: Express server, SSE streaming endpoint (`/api/chat/stream`), tRPC procedure router, OAuth/session management, LLM abstraction (`llm.ts`), and vector embeddings (`vector.ts`).
- **Semantic Engine (`server/`)**:
  - `semanticEngine.ts`: Natural language query interpretation, AST generation, governed MQL execution, unstructured doc RAG.
  - `datasetEngine.ts`: Tabular dataset ingestion, schema inference, lexical/document retrieval, business question answering.
  - `mqlCompiler.ts` & `mqlValidator.ts`: MongoDB Aggregation Pipeline compilation and AST security validation.
  - `db.ts` & `governance.ts`: Data persistence, versioned semantic definitions, RBAC, evaluation benchmarks.
  - `validation.ts`: Semantic interpretation and data formatting validation.
- **Testing (`server/*.test.ts`)**: Vitest test runner with isolated in-memory MongoDB environment (`vitest.setup.ts`).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Dead Scratch & Patch Script Removal | Delete 45+ `patch*.cjs`, loose test scripts, `.bak` files, and `.manus/` logs | M1 | Survey 1 |
| 2 | Dead Client Files Removal | Delete unused template pages (`Home.tsx`, `ComponentShowcase.tsx`) and components (`DashboardLayout`, `ManusDialog`, `Map`) | M1 | Survey 1 |
| 3 | Dead Server Modules Removal | Delete orphaned modules (`imageGeneration.ts`, `map.ts`, `voiceTranscription.ts`, `heartbeat.ts`, `dataApi.ts`, `notification.ts`, `storage.ts`, `knowledgeGraph.ts`, `mqlEngine.ts`) | M1 | Survey 1, 2, 3 |
| 4 | Dead Config & Script Cleanup | Remove `drizzle.config.ts` and dead `"db:push"` in `package.json` | M1 | Survey 1 |
| 5 | Deduplicate Dataset Upload & Vector Logic | Remove duplicate `handleDatasetUpload`, strip BOM characters (`\uFEFF`), consolidate vector similarity into `_core/vector.ts` | M1 | Survey 1, 2, 3 |
| 6 | Vector Dimension & NaN Fix | Fix `cosineSimilarity` dimension mismatch check returning 0 rather than NaN on fallback vectors | M2 | Survey 2 |
| 7 | LLM Streaming AbortSignal & Disconnects | Implement client disconnect listener (`req.on("close")`) and `AbortSignal` in `llm.ts` / SSE endpoint | M2 | Survey 2 |
| 8 | SSE Header Flush & Anti-Buffering | Add `res.flushHeaders()` and `X-Accel-Buffering: no` in `/api/chat/stream` | M2 | Survey 2 |
| 9 | Stream Buffer End-of-Stream Flush | Fix stream chunk decoding in `Chat.tsx` and `llm.ts` to flush remaining buffer when reader completes | M2 | Survey 2 |
| 10 | Client State Concurrency Fix | Fix state overwrite race condition in `Chat.tsx` using functional updater pattern | M2 | Survey 2 |
| 11 | Eliminate Cross-Chat Prompt Pollution | Remove `otherChatsContext` injection to eliminate cross-session hallucination and token bloat | M2 | Survey 2 |
| 12 | Dynamic Semantic Definition Search | Fix `getRelevantDefinitions` in `db.ts` to inspect aliases, short acronyms (`gmv`, `cac`), and remove hardcoded bias | M2 | Survey 2, 3 |
| 13 | Dynamic Metric & Value Validation | Refactor `server/validation.ts` to validate against active catalog definitions and support general numeric patterns | M2 | Survey 2, 3 |
| 14 | Prompt Optimization & Grounding | Refine prompt templates in `datasetEngine.ts` and `semanticEngine.ts` for strict grounded synthesis and citation | M3 | Survey 2, 3 |
| 15 | Dynamic MQL Compilation & Schema Joins | Enhance `mqlCompiler.ts` for dynamic metric expressions, dimension lookups, and relationship traversals | M3 | Survey 3 |
| 16 | Execution Error Self-Correction | Enhance error recovery in semantic and dataset query pipelines | M3 | Survey 2, 3 |
| 17 | AI Accuracy Evaluation Test Suite | Implement `server/aiAccuracy.test.ts` testing grounding, multi-turn context, disambiguation, alias resolution, calculations | M4 | Survey 3 |
| 18 | Full Test Suite & TypeScript Verification | Verify 100% pass on `pnpm test` and zero errors on `pnpm check` | M4 | Survey 1, 3 |
| 19 | Forensic Integrity & Quality Audit | Independent code quality review, challenger stress testing, and forensic integrity audit | M5 | Project Protocol |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Codebase Cleanup (R1) | Features 1–5: Delete dead files/scripts/config, clean BOM, deduplicate vector logic | none | DONE |
| M2 | Bug Squashing in Pipelines (R2) | Features 6–13: Vector NaN fix, SSE abort/flush, buffer flush, state race fix, prompt decontamination, dynamic definition search & validation | M1 | DONE |
| M3 | Accuracy Maximization (R3) | Features 14–16: Prompt optimization, dynamic MQL compilation, error recovery | M2 | DONE |
| M4 | AI Accuracy & E2E Automated Test Suite | Features 17–18: Comprehensive `aiAccuracy.test.ts`, full `pnpm test` and `pnpm check` verification | M3 | DONE |
| M5 | Final Verification & Git Push | Feature 19: Final test verification, git commit & push to origin/main for Railway auto-deployment | M4 | DONE |

---

## Interface Contracts

### 1. Vector & Cosine Similarity (`server/_core/vector.ts`)
- `generateEmbedding(text: string): Promise<number[]>`
- `cosineSimilarity(a: number[], b: number[]): number`: Returns standard cosine similarity `[-1.0, 1.0]`. If `a.length !== b.length` or either norm is 0, returns `0` (never `NaN`).

### 2. LLM Streaming (`server/_core/llm.ts` & `server/_core/index.ts`)
- `streamLLM(params: InvokeParams & { signal?: AbortSignal }): AsyncGenerator<string, void, unknown>`
- `POST /api/chat/stream`: Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Calls `res.flushHeaders()`. Listens for `req.on("close")` and aborts upstream controller.

### 3. Dynamic Definition & Validation (`server/db.ts` & `server/validation.ts`)
- `getRelevantDefinitions(query: string): Promise<SemanticDefinition[]>`: Matches name, description, and `aliases` array (case-insensitive, handles tokens >= 2 chars).
- `validateInterpretation(data: Record<string, any>, availableDefinitions?: SemanticDefinition[]): { valid: boolean; errors: string[] }`: Validates metrics against available definitions catalog without hardcoding `"Completed Revenue"`.

### 4. Dynamic MQL Compiler & Validator (`server/mqlCompiler.ts` & `server/mqlValidator.ts`)
- `compileASTtoMQL(metric: SemanticDefinition, dimension?: SemanticDefinition, definitions?: SemanticDefinition[]): PipelineStage[]`
- `validateMQL(pipeline: unknown): { valid: boolean; error?: string }`

---

## Code Layout
- `client/src/pages/`: `Chat.tsx`, `Admin.tsx`, `Connections.tsx`, `Governance.tsx`, `Evaluation.tsx`, `Automation.tsx`, `NotFound.tsx`.
- `client/src/components/`: `AIChatBox.tsx`, `StudioNav.tsx`, `ErrorBoundary.tsx`, `ui/` primitives.
- `server/_core/`: `index.ts`, `llm.ts`, `vector.ts`, `trpc.ts`, `context.ts`, `cookies.ts`, `env.ts`, `oauth.ts`, `sdk.ts`, `storageProxy.ts`, `systemRouter.ts`, `vite.ts`.
- `server/`: `db.ts`, `semanticEngine.ts`, `datasetEngine.ts`, `governance.ts`, `automation.ts`, `autoGenerate.ts`, `schemaDesigner.ts`, `semanticMapper.ts`, `warehouseDiscovery.ts`, `mqlCompiler.ts`, `mqlValidator.ts`, `validation.ts`, `demoData.ts`, `seedDemo.ts`, `cache.ts`, `types.ts`, `*.test.ts`.
- `shared/`: `const.ts`, `governance.ts`, `semantic.ts`, `types.ts`, `_core/errors.ts`.
