## 2026-09-01T03:49:00Z

You are the implementation specialist for Milestone M1: Codebase Cleanup (R1).

Working Directory: d:/Semantic Layer/.agents/worker_m1
Project Root: d:/Semantic Layer

Read the authoritative requirements:
- `d:/Semantic Layer/.agents/ORIGINAL_REQUEST.md` (Mandatory - read first)
- `d:/Semantic Layer/PROJECT.md`
- `d:/Semantic Layer/.agents/survey_explorer_1/handoff.md`
- `d:/Semantic Layer/.agents/survey_explorer_2/handoff.md`
- `d:/Semantic Layer/.agents/survey_explorer_3/handoff.md`

# Scope of Work for Milestone M1
1. **Clean Root-Level Dead Files & Patch Scripts**:
   - Delete all `patch*.cjs` files (45+ files in root).
   - Delete scratch test & backup files: `Chat.backup.tsx`, `vite.config.ts.bak`, `streamBusiness-add.ts`, `streamLLM-add.ts`, `test-chat.ts`, `test-vector.ts`, `test_pdf.cjs`, `test_pdf2.cjs`, `check-db.ts`, `check-db.cjs`, `curl_test.cjs`, `fix-bom.cjs`, `remove-broken.cjs`, `update-zod.cjs`, `append-clean.cjs`.
   - Delete `.manus/` and `.manus-logs/` folders if present.
   - Delete `drizzle.config.ts`.
   - In `package.json`, remove the dead `"db:push"` script referencing `drizzle-kit`.

2. **Clean Orphaned Client Files**:
   - Delete `client/src/pages/Home.tsx`
   - Delete `client/src/pages/ComponentShowcase.tsx`
   - Delete `client/src/components/DashboardLayout.tsx`
   - Delete `client/src/components/DashboardLayoutSkeleton.tsx`
   - Delete `client/src/components/ManusDialog.tsx`
   - Delete `client/src/components/Map.tsx`
   - In `client/src/pages/Chat.tsx`, remove the unused `chatMutation` declaration.

3. **Clean Orphaned Server Modules**:
   - Delete `server/_core/imageGeneration.ts`
   - Delete `server/_core/map.ts`
   - Delete `server/_core/voiceTranscription.ts`
   - Delete `server/_core/heartbeat.ts`
   - Delete `server/_core/dataApi.ts`
   - Delete `server/_core/notification.ts` (and remove any unused import in `server/_core/systemRouter.ts` or other files).
   - Delete `server/storage.ts`
   - Delete `server/knowledgeGraph.ts`
   - Delete `server/mqlEngine.ts`

4. **Clean up `server/semanticEngine.ts` and `server/datasetEngine.ts`**:
   - In `server/semanticEngine.ts`: remove duplicate `handleDatasetUpload` (lines ~552-603).
   - Strip invisible Unicode Byte Order Marks (`\uFEFF`) from `server/semanticEngine.ts`.
   - Clean up redundant vector / cosine similarity code in `server/semanticEngine.ts` so it imports and uses `server/_core/vector.ts` properly.
   - In `server/datasetEngine.ts`: move mid-file imports (e.g. `streamLLM`) to the top, and remove dead unused imports (like `knowledgeGraph`, `insertKnowledgeGraphEdges`, etc.).

5. **Verification**:
   - Run `pnpm check` (`npx tsc --noEmit`) to verify zero TypeScript errors.
   - Run `pnpm test` (`npx vitest run`) to verify all tests pass without errors.
   - Ensure the app build works (`pnpm build`).

6. **Handoff**:
   - Write a complete, detailed handoff report to `d:/Semantic Layer/.agents/worker_m1/handoff.md`.
   - Send a message back to parent when completed.
