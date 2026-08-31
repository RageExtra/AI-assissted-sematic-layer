# Milestone Execution Plan

## Milestone M1: Codebase Cleanup (R1)
- **Assigned Worker**: `worker_m1`
- **Scope**:
  - Delete 45+ `patch*.cjs`, loose test scripts, `.bak` files, `.manus/`, `.manus-logs/`.
  - Delete unused client files: `Home.tsx`, `ComponentShowcase.tsx`, `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`, `ManusDialog.tsx`, `Map.tsx`.
  - Delete dead server modules: `imageGeneration.ts`, `map.ts`, `voiceTranscription.ts`, `heartbeat.ts`, `dataApi.ts`, `notification.ts`, `storage.ts`, `knowledgeGraph.ts`, `mqlEngine.ts`.
  - Delete `drizzle.config.ts` and clean up `package.json` scripts (`"db:push"`).
  - Remove duplicate `handleDatasetUpload` from `server/semanticEngine.ts` and strip invisible BOM (`\uFEFF`) characters.
  - Consolidate embedding & vector similarity into `server/_core/vector.ts` and clean up mid-file imports in `datasetEngine.ts`.
- **Verification**: Run `pnpm check` and `pnpm test` to verify zero regressions.
- **Gate**: Reviewer + Challenger + Auditor inspection.

## Milestone M2: Bug Squashing in Pipelines (R2)
- **Assigned Worker**: `worker_m2`
- **Scope**:
  - Fix vector dimension mismatch check in `server/_core/vector.ts` to return 0 rather than NaN.
  - Add `signal?: AbortSignal` to `streamLLM` in `server/_core/llm.ts` and attach `req.on("close")` / `req.on("aborted")` listener in Express SSE stream `/api/chat/stream`.
  - Add `res.flushHeaders()` and `X-Accel-Buffering: no` in `/api/chat/stream`.
  - Fix stream buffer end-of-stream decoding flush in `client/src/pages/Chat.tsx` and `server/_core/llm.ts`.
  - Fix client-side state overwrite race conditions in `Chat.tsx` using functional updater pattern `prev => ...`.
  - Eliminate cross-chat prompt contamination by removing `otherChatsContext` from `Chat.tsx` and `datasetEngine.ts`.
  - Fix `getRelevantDefinitions` in `server/db.ts` to inspect aliases, short acronyms (`gmv`, `cac`, `arr`), and remove hardcoded bias.
  - Refactor `server/validation.ts` to validate metrics against active definitions and support general numeric formats.
- **Verification**: Run `pnpm check` and `pnpm test`.
- **Gate**: Reviewer + Challenger + Auditor inspection.

## Milestone M3: Accuracy Maximization (R3)
- **Assigned Worker**: `worker_m3`
- **Scope**:
  - Refine prompt templates in `datasetEngine.ts` and `semanticEngine.ts` for strict grounded synthesis, entity disambiguation, and explicit citations.
  - Enhance `mqlCompiler.ts` for dynamic metric expressions, dimension lookups, and relationship traversals.
  - Enhance execution error self-correction in semantic query and dataset query pipelines.
- **Verification**: Run `pnpm check` and `pnpm test`.
- **Gate**: Reviewer + Challenger + Auditor inspection.

## Milestone M4: AI Accuracy Evaluation & E2E Test Suite (M4)
- **Assigned Worker**: `worker_m4` (`teamwork_preview_test_writer` / `teamwork_preview_worker`)
- **Scope**:
  - Implement comprehensive automated test suite `server/aiAccuracy.test.ts` covering:
    1. Grounded answering (tabular dataset grounding & citation).
    2. Document RAG accuracy & hallucination resistance.
    3. Multi-turn conversational context & pronoun/acronym resolution.
    4. Disambiguation gating & policy refusal on underspecified queries.
    5. Financial calculation exactness & filtering (completed orders only).
  - Verify complete passing test suite (`pnpm test`) and zero TypeScript compiler warnings/errors (`pnpm check`).
- **Gate**: Reviewer + Challenger + Auditor inspection.

## Milestone M5: Final Verification & Forensic Audit
- Dual reviewers, challengers, and forensic auditor integrity check. Final report generation.
