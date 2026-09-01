# Execution Plan — Semantic Layer Cleanup & Optimization

## Objectives
1. **Milestone M3 Gate Completion (R1/R3)**: Complete Challenger stress testing and Forensic Integrity Audit for M3 (Accuracy Maximization: system prompt grounding, bracket citations, dynamic MQL joins and expression parsing, ambiguity gating, self-correcting error handling).
2. **Milestone M4: AI Accuracy Benchmark & E2E Automated Test Suite (R2)**:
   - Implement comprehensive automated AI accuracy test suite in `server/aiAccuracy.test.ts` (and verify all tests in Vitest).
   - Test grounding citations, multi-turn context retention, disambiguation handling, alias/acronym mapping, dynamic MQL generation, calculation verification, and execution error fallbacks.
   - Run `pnpm test` (must pass 100% with 0 errors) and `pnpm check` (TypeScript compilation with 0 errors).
3. **Milestone M4 Gate & M5 Final Verification**:
   - Independent Reviewer, Challenger, and Forensic Auditor for M4.
   - Run production build `pnpm build`.
   - Commit all changes and push to `origin/main` for Railway auto-deployment.
4. **Human Report**:
   - Send complete synthesized report to Sentinel / caller via `send_message`.

---

## Step-by-Step Milestones

### Phase 1: Milestone M3 Gate Resolution
- [ ] Dispatch Challenger (`teamwork_preview_challenger`) for M3 changes.
- [ ] Dispatch Forensic Auditor (`teamwork_preview_auditor`) for M3 changes.
- [ ] Verify Gate (Reviewer: APPROVE, Challenger: APPROVE, Auditor: CLEAN).

### Phase 2: Milestone M4 (AI Accuracy Benchmark & E2E Test Suite)
- [ ] Dispatch Worker / Test Writer (`teamwork_preview_worker`) to implement comprehensive `server/aiAccuracy.test.ts` and ensure full E2E evaluation coverage.
- [ ] Worker runs `pnpm test` and `pnpm check` to verify 100% pass.
- [ ] Dispatch Reviewer (`teamwork_preview_reviewer`) to review M4 tests and pipeline reliability.
- [ ] Dispatch Challenger (`teamwork_preview_challenger`) to stress-test M4 test suite.
- [ ] Dispatch Forensic Auditor (`teamwork_preview_auditor`) for M4 integrity audit.
- [ ] Evaluate M4 Gate.

### Phase 3: Final Verification & Git Push
- [ ] Dispatch Worker to commit and push all changes to `origin/main`.
- [ ] Verify remote push status and Railway build readiness.

### Phase 4: Final Synthesis & Sentinel Report
- [ ] Prepare synthesized report.
- [ ] Send message to parent.
