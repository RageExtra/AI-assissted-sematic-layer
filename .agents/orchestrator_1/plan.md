# Project Plan — Semantic Layer Cleanup, Bug Squashing & Accuracy Maximization

## 1. Survey Phase
- [ ] Dispatch 3 parallel Explorers:
  - `survey_explorer_1`: Full codebase architecture inventory, dead code/unused files scan, package structure.
  - `survey_explorer_2`: RAG, LLM streaming, prompt engineering, context injection & hallucination risks.
  - `survey_explorer_3`: MQL execution pipeline, Cube/semantic queries, schema validation, error handling, existing test setup.
- [ ] Synthesize findings into `PROJECT.md` Feature Inventory & Architecture specification.

## 2. Milestone Decomposition & Execution
- [ ] **M1: Codebase Cleanup (R1)**
  - Remove dead/unreferenced files, obsolete endpoints/utilities, commented-out dead code.
  - Fix import paths and clean package dependencies if needed.
- [ ] **M2: Bug Squashing in Core Pipelines (R2)**
  - Fix race conditions and stream error drops in LLM streaming / SSE.
  - Fix edge cases in RAG retrieval, vector search fallback, document chunking.
  - Fix MQL generation/execution errors, schema mismatches, date range handling, filter composition.
- [ ] **M3: Accuracy Maximization (R3)**
  - Refine prompt templates for precise MQL query generation and grounded synthesis.
  - Improve context window management, table/metric schema injection, few-shot examples.
  - Enhance execution error recovery (self-correction loops if query fails).
- [ ] **M4: Automated Testing & AI Accuracy Evaluation Suite**
  - Implement comprehensive AI accuracy benchmark tests (ground truth queries, precision/recall, grounding checks).
  - Expand unit & integration test coverage for all modified modules.
  - Verify `pnpm test` passes 100% (0 failures).
  - Verify `pnpm check` passes with 0 TypeScript compilation errors.

## 3. Verification & Forensic Audit Gate
- [ ] Reviewers verify code quality, completeness, and adherence to requirements.
- [ ] Challengers stress test the pipeline and AI accuracy.
- [ ] Forensic Auditor verifies code integrity (no mocking shortcuts, authentic implementations).
- [ ] Final verification across all acceptance criteria and handoff delivery.
