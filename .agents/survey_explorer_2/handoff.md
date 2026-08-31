# Survey & Deep-Dive Investigation: RAG, LLM Streaming, and AI Accuracy Pipelines

**Specialist**: survey_explorer_2 (RAG & LLM Streaming Specialist)  
**Date**: 2026-09-01  
**Working Directory**: `d:/Semantic Layer/.agents/survey_explorer_2`

---

## 1. Observation

A complete audit of all files governing prompt construction, context retrieval, vector embedding, LLM invocation, Server-Sent Events (SSE) streaming, and client-side chat consumption was performed.

### 1.1 Architecture & File Inventory

| Component / Subsystem | Primary Files | Key Functions & Responsibilities |
|---|---|---|
| **LLM Client & Streaming** | `server/_core/llm.ts` | `invokeLLM`, `streamLLM`, `listLLMModels`, `resolveChatModel`, `fetchWithBackoff`, message & schema normalization |
| **SSE Streaming Endpoint** | `server/_core/index.ts` | POST `/api/chat/stream`, SSE headers, chunk streaming loop |
| **Dataset Ingestion & RAG** | `server/datasetEngine.ts` | `processDatasetUpload`, `inferSchema`, `summarizeRows`, `retrieveRows`, `getCatalogContext`, `findRelevantDatasetDocuments`, `answerBusinessQuestion`, `streamBusinessQuestion` |
| **Unstructured Document RAG** | `server/semanticEngine.ts` | `handleDocumentUpload` (PDF, DOCX, XLSX, TXT), `embedText`, `queryUnstructuredDocuments`, `buildSemanticQuery`, `interpretWithLLM` |
| **Vector Embeddings & Similarity** | `server/_core/vector.ts`, `server/semanticEngine.ts` | `generateEmbedding`, `cosineSimilarity`, Xenova pipeline singleton |
| **AST & MQL Compilation** | `server/mqlCompiler.ts`, `server/mqlValidator.ts` | `compileASTtoMQL`, `validateMQL` (aggregation pipeline security) |
| **Semantic & Prompt Governance** | `server/db.ts`, `server/governance.ts`, `server/validation.ts` | `getRelevantDefinitions`, `ensureGovernanceSeeds`, `validateInterpretation`, evaluation suites |
| **Chat UI & Client Stream Consumer** | `client/src/components/AIChatBox.tsx`, `client/src/pages/Chat.tsx` | Message state management, SSE chunk buffer parsing, Streamdown markdown rendering, file staging |
| **Automated Schema & Mapping** | `server/schemaDesigner.ts`, `server/semanticMapper.ts`, `server/autoGenerate.ts` | `designSchema`, `mapSemanticDefinitions`, `generateSchemaSqlFromSource` |
| **Dead / Duplicate Code** | `server/knowledgeGraph.ts`, `server/mqlEngine.ts`, `server/semanticEngine.ts` (lines 552–603) | `insertKnowledgeGraphEdges`, `searchKnowledgeGraph`, `generateAndExecuteMql`, duplicate `handleDatasetUpload` |

---

### 1.2 Identified Bugs, Race Conditions, and Vulnerabilities

#### Bug 1: Vector Dimension Mismatch & `NaN` Crash in Cosine Similarity
* **Location**: `server/semanticEngine.ts` lines 615–637 and `server/_core/vector.ts` lines 26–33.
* **Direct Observation**:
  In `server/semanticEngine.ts`:
  ```ts
  615: const vector = new Array<number>(128).fill(0);
  ...
  626: function cosineSimilarity(vecA: number[], vecB: number[]) {
  627:   let dotProduct = 0;
  628:   let normA = 0;
  629:   let normB = 0;
  630:   for (let i = 0; i < vecA.length; i++) {
  631:     dotProduct += vecA[i] * vecB[i];
  632:     normA += vecA[i] * vecA[i];
  633:     normB += vecB[i] * vecB[i];
  634:   }
  635:   if (normA === 0 || normB === 0) return 0;
  636:   return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  637: }
  ```
  If Xenova pipeline throws (e.g. offline/network failure), `embedText` produces a 128-element hash fallback vector. If documents were previously indexed with 384 dimensions (from `all-MiniLM-L6-v2`), `vecA.length` (384) > `vecB.length` (128). When `i >= 128`, `vecB[i]` is `undefined`, so `vecA[i] * undefined` produces `NaN`. `dotProduct` becomes `NaN`, causing `scoredDocs.sort((a, b) => b.score - a.score)` to fail silently and return corrupted document rankings.

#### Bug 2: Missing AbortSignal & Unhandled Client Disconnects in LLM Streaming
* **Location**: `server/_core/llm.ts` (lines 478–531) and `server/_core/index.ts` (lines 59–81).
* **Direct Observation**:
  - `server/_core/index.ts`:
    ```ts
    59: app.post("/api/chat/stream", async (req, res) => {
    ...
    69:   const stream = streamBusinessQuestion(messages, otherChatsContext);
    70:   for await (const chunk of stream) {
    71:     res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    72:   }
    ```
  - There is no `req.on("close", ...)` or `req.on("aborted", ...)` handler on the Express request.
  - `streamLLM` and `streamBusinessQuestion` do not accept an `AbortSignal`.
  - When a user navigates away, reloads, or creates a new chat, the server continues pulling tokens from the upstream LLM API until completion, wasting token quotas, CPU, and memory.

#### Bug 3: Missing Header Flushing and Buffer Headers for SSE
* **Location**: `server/_core/index.ts` lines 64–66.
* **Direct Observation**:
  `res.flushHeaders()` (or `res.flush?.()`) is never called after setting SSE headers. In production environments behind reverse proxies (Nginx, Cloudflare, Railway) or with gzip/compression middleware, SSE chunks may be buffered in 4KB/16KB blocks rather than streamed incrementally to the client. The header `X-Accel-Buffering: no` is also omitted.

#### Bug 4: Incomplete Token Buffer Truncation at Stream End
* **Location**: `server/_core/llm.ts` (lines 512–530) and `client/src/pages/Chat.tsx` (lines 268–291).
* **Direct Observation**:
  In `client/src/pages/Chat.tsx`:
  ```ts
  268: while (true) {
  269:   const { done, value } = await reader.read();
  270:   if (done) break;
  271:   buffer += decoder.decode(value, { stream: true });
  272:   let newlineIndex;
  273:   while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
  ...
  ```
  If the stream terminates (`done === true`) and the last chunk did not contain a trailing `\n`, the remaining content in `buffer` is discarded because the loop immediately breaks without a final flush of `buffer` or `decoder.decode()`.

#### Bug 5: Client-Side State Overwrite Race Condition in Chat Sessions
* **Location**: `client/src/pages/Chat.tsx` lines 222–228 and 293–301.
* **Direct Observation**:
  ```ts
  222: const nextMessages = [...currentMsgs, userMsg];
  224: setSessions(prev => {
  225:   const updated = prev.map(s => s.id === targetSessionId ? { ...s, messages: nextMessages, updatedAt: Date.now() } : s);
  ...
  293: setSessions(prev => {
  294:   const updated = prev.map(s => s.id === targetSessionId ? { 
  295:     ...s, 
  296:     messages: [...nextMessages, { role: "assistant" as const, content: streamedContent || "I could not produce a grounded answer." }],
  297:     updatedAt: Date.now()
  298:   } : s);
  ```
  `nextMessages` is captured in closure scope at the invocation of `handleSendMessage`. If the user submits a message or an upload finishes during streaming, `setSessions` replaces the session's message list with `[...nextMessages, assistantMessage]`, overwriting any intervening updates.

#### Bug 6: Prompt Pollution & Hallucination via `otherChatsContext`
* **Location**: `client/src/pages/Chat.tsx` lines 239–247 and `server/datasetEngine.ts` lines 270, 312.
* **Direct Observation**:
  In `Chat.tsx`:
  ```ts
  239: const otherChatsContext = sessions
  240:   .filter(s => s.id !== targetSessionId && s.messages.length > 1)
  241:   .map(s => {
  242:     const title = s.messages.find(m => m.role === "user")?.content || "Previous Chat";
  243:     const msgContent = s.messages.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  244:     return `--- Chat: ${title} ---\n${msgContent}`;
  245:   })
  246:   .slice(-5)
  247:   .join("\n\n");
  ```
  This dumps the last 6 messages from up to 5 unrelated chat sessions and injects them directly into the system prompt:
  `${otherChatsContext ? `PAST CHAT HISTORY CONTEXT (Use for reference if the user refers to past conversations):\n${otherChatsContext}\n\n` : ""}`
  This severely pollutes the LLM context with contradictory numbers, entities, and questions from distinct sessions, inducing cross-conversation hallucinations and ballooning prompt token consumption.

#### Bug 7: Hardcoded & Fragile Keyword Filtering in `getRelevantDefinitions`
* **Location**: `server/db.ts` lines 515–533.
* **Direct Observation**:
  ```ts
  521: const filtered = all.filter(def => {
  522:   const term = def.name.toLowerCase();
  523:   const desc = def.description.toLowerCase();
  526:   const words = q.split(/\W+/).filter(w => w.length > 3);
  527:   const matches = words.some(w => term.includes(w) || desc.includes(w));
  529:   return matches || term.includes("revenue") || term.includes("customer"); 
  530: });
  ```
  - Defers unconditionally to `revenue` and `customer` definitions even on unrelated queries (e.g. churn, expenses, supply chain).
  - Drops 1–3 letter business abbreviations (`gmv`, `arr`, `cac`, `tax`, `net`).
  - Ignores `def.aliases` entirely! If a definition has aliases `["turnover", "sales"]`, the filter fails to inspect them.

#### Bug 8: Hardcoded Metric Constraint in `validateInterpretation`
* **Location**: `server/validation.ts` lines 8–12.
* **Direct Observation**:
  ```ts
  9: if (data.metric && data.metric !== "Completed Revenue" && data.metric !== "Unresolved") {
  10:   errors.push(`Invalid metric: "${data.metric}". Must be "Completed Revenue".`);
  11: }
  ```
  This hardcoded validation rule causes any dynamically inferred metric from user-uploaded datasets (e.g. "Total Units", "Operating Expenses", "EBITDA") to fail validation, forcing the semantic engine into fallback clarification mode.

#### Bug 9: Duplicate and Dead Code
* **Location**:
  - `server/knowledgeGraph.ts` (entire file, 43 lines): Imported in `datasetEngine.ts` but never called anywhere.
  - `server/mqlEngine.ts` (`generateAndExecuteMql`): 85 lines of dead code with a conflicting validation policy (`$lookup` forbidden in `mqlEngine.ts` vs allowed in `mqlValidator.ts`).
  - `server/semanticEngine.ts` lines 552–603 (`handleDatasetUpload`): Duplicate implementation of dataset upload; the active implementation is in `server/datasetEngine.ts` (`queueDatasetIngestion`).
  - `server/semanticEngine.ts` lines 550 and 605: Invisible Unicode Byte Order Mark (BOM U+FEFF) characters present in source.
  - `client/src/pages/Chat.tsx` lines 162–168: Redundant `chatMutation` defined but unused.

---

## 2. Logic Chain

1. **RAG Context Flow**:
   - User submits question -> `Chat.tsx` posts to `/api/chat/stream`.
   - `datasetEngine.ts` runs three parallel retrieval tasks: `getCatalogContext()`, `findRelevantDatasetDocuments()`, `queryUnstructuredDocuments()`.
   - `retrieveRows()` extracts matching rows via lexical token overlap.
   - `queryUnstructuredDocuments()` scores chunks using cosine similarity against Xenova embeddings.
   - Grounded context is formatted and prepended to system instructions.

2. **Inaccuracy Ingestion Points**:
   - If `otherChatsContext` contains unrelated entities from other conversations, the model confuses tables/columns and invents relationships.
   - If `getRelevantDefinitions()` filters out legitimate domain definitions due to missing alias checks or length > 3 constraints, the LLM falls back or hallucinates definitions.
   - If cosine similarity encounters dimension mismatch between 384d model embeddings and 128d hash fallback embeddings, ranking produces `NaN`, resulting in arbitrary document context selection.

3. **Streaming Stability & Abort Lifecycle**:
   - Client starts streaming with `fetch("/api/chat/stream")`.
   - Server runs `streamBusinessQuestion` -> `streamLLM`.
   - If client disconnects or clicks "New Chat", client drops fetch reader, but server keeps generator loop active until LLM endpoint finishes.
   - When streaming finishes, client replaces session messages using stale closure variable `nextMessages`, discarding any messages added during the streaming interval.

---

## 3. Caveats

- **External Model API vs Offline Fallbacks**: In local dev/test environments without `OPENAI_API_KEY`, `resolveChatModel()` and `invokeLLM` gracefully fall back to deterministic mock generators in `semanticEngine.ts`.
- **HuggingFace / Xenova Transformers Download**: `@xenova/transformers` fetches the `all-MiniLM-L6-v2` ONNX model from the Hugging Face CDN on first run. If offline, the fallback hash embedding path executes, which makes fixing the cosine similarity vector length matching critical.

---

## 4. Conclusion & Actionable Recommendations

### 4.1 RAG & Context Recommendations
1. **Unify Vector Embeddings**: Consolidate `embedText` and `cosineSimilarity` into `server/_core/vector.ts`. Ensure `cosineSimilarity` checks `vecA.length === vecB.length` and returns `0` on dimension mismatch.
2. **Fix `getRelevantDefinitions`**: Update the definition filter to inspect `def.aliases`, handle short acronyms (`gmv`, `cac`, `arr`), and remove the hardcoded bias for `"revenue"` / `"customer"`.
3. **Remove Cross-Chat Pollution**: Strip `otherChatsContext` from `Chat.tsx` and `datasetEngine.ts`. Conversational context should only track the active session.
4. **Generalize `validateInterpretation`**: Allow any metric that matches an approved or uploaded definition, rather than hardcoding `"Completed Revenue"`.

### 4.2 LLM Streaming & Chat Reliability Recommendations
1. **Add AbortSignal & Disconnect Handlers**:
   - Add `signal?: AbortSignal` to `InvokeParams` in `server/_core/llm.ts`.
   - Listen for `req.on("close", () => controller.abort())` in `/api/chat/stream`.
2. **Fix SSE Flush & Headers**: Add `res.flushHeaders()` and `X-Accel-Buffering: no` in `/api/chat/stream`.
3. **Fix Client State Updates**: In `Chat.tsx`, use functional state updates (`prev => ...`) inside `setSessions` rather than referencing stale closure variables (`nextMessages`).
4. **Flush Buffer at Stream End**: Ensure `Chat.tsx` and `server/_core/llm.ts` process any remaining text in `buffer` when the stream reader completes.

### 4.3 Codebase Cleanup Recommendations
1. Delete dead files `server/knowledgeGraph.ts` and `server/mqlEngine.ts`.
2. Remove duplicate `handleDatasetUpload` in `server/semanticEngine.ts` and strip BOM characters.
3. Remove unused `chatMutation` in `client/src/pages/Chat.tsx`.
4. Add comprehensive automated tests specifically validating AI accuracy, RAG retrieval with aliases, and streaming edge cases.

---

## 5. Verification Method

To verify these findings and future fixes independently:
1. **Type Check**:
   ```bash
   pnpm check
   ```
2. **Run Full Test Suite**:
   ```bash
   pnpm test
   ```
3. **Targeted Semantic & Vector Tests**:
   ```bash
   pnpm vitest run server/semanticEngine.test.ts server/semantic.router.test.ts
   ```
4. **Verify Clean Output & Absence of BOM**:
   Verify no invisible Unicode characters exist in `server/semanticEngine.ts`.
