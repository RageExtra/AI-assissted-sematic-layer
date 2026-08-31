# BRIEFING — 2026-09-01T04:18:00Z

## Mission
Deliver Milestone M3: Accuracy Maximization (R3), implementing prompt grounding & citations, dynamic MQL compilation with relationship joins, and execution error self-correction & ambiguity handling.

## 🔒 My Identity
- Archetype: worker_m3
- Roles: implementer, qa, specialist
- Working directory: d:/Semantic Layer/.agents/worker_m3
- Original parent: c95cddc3-f4b4-4798-98a2-ec505aedbccc
- Milestone: M3 (Features 14-16)

## 🔒 Key Constraints
- Ground all assertions strictly in provided Context (Semantic Definitions, Tabular Schemas/Rows, Unstructured Chunks).
- Mandate citation of sources (`[Dataset: <title>]`, `[Document: <name>]`, `[Governed Metric: <name>]`).
- Refuse hallucination/unwarranted extrapolation; ask focused clarifying questions if ambiguous.
- Parse dynamic metric expressions (SUM, AVG, COUNT, etc.) and dimension collection/field expressions.
- Traverse semantic relationships to generate safe `$lookup` + `$unwind` pipeline stages across collections.
- Ensure all generated MQL passes `validateMQL`.
- Catch MQL execution errors gracefully and provide fallback/clarification guidance.
- Pass `pnpm check`, `pnpm test`, and `pnpm build`.

## Current Parent
- Conversation ID: c95cddc3-f4b4-4798-98a2-ec505aedbccc
- Updated: not yet

## Task Summary
- **What to build**: Prompt grounding & citations (Feature 14), Dynamic MQL compilation & joins (Feature 15), Execution error self-correction & ambiguity handling (Feature 16).
- **Success criteria**: Strict grounding and citations in prompts, dynamic compilation of metric expressions and joins between collections passing MQL validator, resilient ambiguity and error handling, 100% passing tests and clean build.
- **Interface contracts**: `server/datasetEngine.ts`, `server/semanticEngine.ts`, `server/mqlCompiler.ts`, `server/mqlValidator.ts`.
- **Code layout**: `server/`

## Key Decisions Made
- [Initial planning]

## Change Tracker
- **Files modified**: None yet
- **Build status**: Pending initial run
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pending
- **Lint status**: Pending
- **Tests added/modified**: Pending

## Loaded Skills
None

## Artifact Index
- `d:/Semantic Layer/.agents/worker_m3/DISPATCH.md` — Assignment & scope
- `d:/Semantic Layer/.agents/worker_m3/BRIEFING.md` — Agent state and briefing
- `d:/Semantic Layer/.agents/worker_m3/progress.md` — Liveness and progress heartbeat
