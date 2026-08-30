# Contributing to the Semantic Layer

First off, thank you for considering contributing to the Semantic Layer! It's people like you that make the open-source community such a great place to learn, inspire, and create.

## Development Workflow

1. **Fork & Clone:** Fork the repository to your own GitHub account and clone it to your local machine.
2. **Branching:** Create a new branch for your feature or bugfix (\git checkout -b feature/amazing-feature\).
3. **Local Testing:** Ensure you run the test suite before committing any changes. 
   \\\ash
   pnpm test
   \\\
4. **Commit Standards:** Use conventional commits (e.g., \eat: added caching\, \ix: resolved AST parsing error\).
5. **Pull Request:** Open a Pull Request against the \main\ branch.

## Modifying the Semantic Compiler

If you are contributing to \server/mqlCompiler.ts\ or \server/semanticEngine.ts\:
- **Never allow raw LLM strings into the compiler output.** All MQL stages must use strictly validated parameters from the AST.
- If you introduce a new Query Intent (e.g., \orecasting\), you MUST update the \QueryIntent\ type in \shared/semantic.ts\ and update the JSON Schema inside \interpretWithLLM\.

## Reporting Bugs
If you find a security vulnerability or a hallucination bypass, please open a detailed GitHub Issue outlining the steps to reproduce the exact LLM prompt that bypassed the \mqlValidator\.
