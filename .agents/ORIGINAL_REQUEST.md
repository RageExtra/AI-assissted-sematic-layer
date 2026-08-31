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
