## 2026-09-01T06:57:02Z
You are the Worker for Milestone M4 (AI Accuracy Benchmark & E2E Automated Test Suite).

Working directory: d:/Semantic Layer/.agents/worker_m4
Project root: d:/Semantic Layer

Authoritative documents to read:
- `d:/Semantic Layer/.agents/ORIGINAL_REQUEST.md`
- `d:/Semantic Layer/PROJECT.md`

Your tasks for Milestone M4:
1. Create a comprehensive, production-grade automated AI Accuracy & Pipeline Reliability evaluation test suite in `server/aiAccuracy.test.ts`.
   Structure the test suite systematically across four key evaluation tiers:
   - **Tier 1: Grounding, Citations & Intent Resolution**:
     - Evaluate structured markdown context formatting and bracket citation tags (`[Dataset: <title>]`, `[Document: <name>]`, `[Governed <Kind>: <name>]`).
     - Evaluate alias & acronym resolution (e.g. `GMV`, `CAC`, `AOV`, `churn`, `monthly revenue`) via `getRelevantDefinitions` in `server/db.ts`.
     - Evaluate semantic definition search with draft vs active status filtering.
   - **Tier 2: Multi-Turn Conversation & Disambiguation Gating**:
     - Evaluate multi-turn history search context construction in RAG.
     - Evaluate ambiguity detection and gating (`clarification_required`, suggested questions, empty sql) on underspecified queries.
     - Evaluate quick conversational reply routing (greetings, thanks) without unnecessary database execution.
   - **Tier 3: Dynamic MQL Compilation & Live Database Arithmetic**:
     - Evaluate dynamic MQL compilation across all aggregation operators (`SUM`, `AVG`, `COUNT`, `MIN`, `MAX`), calendar grains (`Month`), and WHERE filters.
     - Evaluate dynamic cross-collection relationship joins (`$lookup` + `$unwind`) for standard and custom uploaded datasets (`dataset_*`).
     - Execute compiled MQL against in-memory MongoDB (`mongodb-memory-server`) to verify arithmetic and data integrity.
   - **Tier 4: Pipeline Reliability, Error Recovery & Security**:
     - Evaluate MQL security bounds and injection attack rejection via `validateMQL`.
     - Evaluate graceful fallback execution when external LLM APIs are unavailable.
     - Evaluate vector embedding cosine similarity robustness (no NaN on dimension mismatch or zero vectors).
     - Evaluate semantic interpretation validation against dynamic catalog definitions.

2. Run full verification commands:
   - `pnpm check` (must pass with 0 type errors)
   - `pnpm test` (must pass 100% with 0 errors)
   - `pnpm build` (must build cleanly with code 0)

3. Write a comprehensive handoff report to `d:/Semantic Layer/.agents/worker_m4/handoff.md` including Observation, Logic Chain, Caveats, Conclusion, and Verification Method.

4. Send a message to parent upon completion.
