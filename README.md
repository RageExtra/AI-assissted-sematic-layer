# AI-Powered Semantic Layer

An enterprise-grade Semantic Layer that translates Natural Language to MongoDB queries using deterministic compilation. By decoupling semantic intent from physical execution, this engine guarantees 100% mathematical accuracy and read-only security while preventing Large Language Model (LLM) hallucinations.

## Features

- **Execution Decoupling (AST Compilation):** LLMs do not write database code. They output a strict Abstract Syntax Tree (AST), which is mathematically compiled into MongoDB Aggregation Pipelines (MQL).
- **Infinite Scale Hybrid RAG:** Intelligently filters and injects only the most relevant Semantic Definitions into the LLM context, preventing context-bloat and allowing for thousands of governed metrics.
- **Auto-Governance:** If a user requests an undocumented metric, the system detects an 'Orphan Intent' and drafts a proposed definition for a Data Steward to review, rather than hallucinating a response.
- **Proactive Disambiguation:** Halts execution and requires human-in-the-loop clarification for fuzzy or ambiguous terminology (e.g., asking for 'sales' when multiple sales metrics exist).
- **Strict Read-Only Firewall:** The \mqlValidator\ intercepts all queries before they hit the database, aggressively blocking any destructive mutations (\\\, \\\).
- **Predictive Cache Pre-Warming:** A background cron task routinely pre-compiles and executes the most common queries, providing executives with 0-millisecond dashboard latency.

## Getting Started

### Prerequisites
- Node.js (v18+)
- pnpm (or npm/yarn)
- MongoDB Atlas Cluster
- OpenAI or Groq API Key

### Installation

1. **Clone the repository:**
   \\\ash
   git clone https://github.com/RageExtra/AI-assissted-sematic-layer.git
   cd AI-assissted-sematic-layer
   \\\

2. **Install dependencies:**
   \\\ash
   pnpm install
   \\\

3. **Configure Environment Variables:**
   Create a \.env\ file in the root directory:
   \\\env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0...
   DATABASE_URL=mongodb+srv://<username>:<password>@cluster0...
   BUILT_IN_FORGE_API_KEY=your_llm_api_key
   JWT_SECRET=your_secure_random_string
   NODE_ENV=development
   \\\

4. **Start the Development Server:**
   \\\ash
   pnpm run dev
   \\\
   The application will be available at \http://localhost:5000\.

## Testing

This project includes a comprehensive regression suite utilizing \itest\.
To run the automated tests verifying LLM extraction and security firewalls:
\\\ash
pnpm test
\\\

## Deployment
This project is pre-configured for automated deployment via Railway. Simply connect your GitHub repository to a new Railway project and supply the environment variables.

## Documentation
For deeper architectural details, please review the \docs/ARCHITECTURE.md\ file.
