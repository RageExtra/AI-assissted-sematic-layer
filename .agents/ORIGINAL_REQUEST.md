# Original User Request

## 2026-09-01T03:08:07+05:30

# Teamwork Project Prompt

> Requested team: Full team

A comprehensive codebase cleanup and optimization of the Semantic Layer project. The goal is to remove useless/dead code, fix any lingering bugs, and maximize the AI chatbot's accuracy and reliability for production use.

Working directory: d:/Semantic Layer
Integrity mode: benchmark

## Requirements

### R1. Codebase Cleanup
Audit the entire codebase to remove dead code, unused files, and redundant logic. Ensure clean, maintainable architecture.

### R2. Bug Squashing
Identify and fix any hidden bugs, race conditions, or edge cases in the RAG, LLM streaming, and MQL execution pipelines.

### R3. Accuracy Maximization
Optimize the LLM prompts, context injection, and execution error handling to ensure the chatbot provides highly accurate, grounded answers. 

## Acceptance Criteria

### Verification
- [ ] pnpm test must pass completely with 0 errors.
- [ ] No TypeScript compilation errors (pnpm check).
- [ ] New automated test cases must be written and pass to specifically evaluate the chatbot's AI accuracy.
- [ ] Codebase must not contain unused files or commented-out dead code.

## 2026-09-01T12:20:02+05:30

# Teamwork Project Prompt — Continuation

> Requested team: Full team

A comprehensive codebase cleanup and optimization of the Semantic Layer project. The goal is to maximize the AI chatbot's accuracy and reliability for production use.

Working directory: d:/Semantic Layer
Integrity mode: benchmark

## Context (Previous Run)
A prior run was interrupted. Milestone M2 (Bug Squashing) is COMPLETE and the code has been pushed to main. 
Milestone M3 (Accuracy Maximization) was IN PROGRESS.

Please pick up from where work left off. Continue executing M3 and then M4 (Accuracy Benchmark & E2E Testing).

## Requirements

### R1. Accuracy Maximization (M3)
Optimize the LLM prompts, context injection, and execution error handling to ensure the chatbot provides highly accurate, grounded answers. Fix any edge cases in mqlCompiler.ts if any remain.

### R2. Benchmark and E2E Testing (M4)
Write and verify tests to specifically evaluate the chatbot's AI accuracy.

## Acceptance Criteria
- [ ] `pnpm test` must pass completely with 0 errors.
- [ ] Commit and push all changes to origin/main when done so Railway auto-deploys.

