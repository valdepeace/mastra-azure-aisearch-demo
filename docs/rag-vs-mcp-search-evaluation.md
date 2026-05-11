# Evaluation: RAG in Mastra vs MCP Search

Date: 2026-03-01

## Executive Summary

For this demo, it makes sense to keep **internal RAG in Mastra** even if you also have an MCP search server.

Short reason:

- Internal RAG directly validates `@mastra/azure-ai-search` (the main purpose of this repository).
- MCP search solves a different problem: external tool federation. It does not replace Mastra memory + storage flow by default.

## 1) How Mastra uses stores (technical basis)

Based on the installed `@mastra/core` + `@mastra/memory` implementation in this project:

- `storage` (transactional store):
  - stores threads, messages, resources, and memory metadata.
- `vector` (vector store):
  - used for semantic recall (embeddings + semantic search).
- `embedder`:
  - creates embeddings for both user queries and saved messages.

In semantic recall:

1. Mastra queries the vector store with a query embedding.
2. It filters by `resource_id` (scope `resource`) or `thread_id` (scope `thread`).
3. It retrieves full messages from storage by `message_id`.
4. After generating a response, it upserts new embeddings to the vector store with message metadata.

This confirms the key pattern: **vector store and storage serve different, complementary roles**.

## 2) What this demo currently does

### 2.1 Main storage

- The Mastra root instance uses `LibSQLStore` as primary storage.
- This covers conversation persistence, traces, and operational data.

### 2.2 Semantic memory

- `knowledgeMemoryAgent` configures `Memory` with:
  - `vector: AzureAISearchVector`
  - `embedder: text-embedding-3-small`
  - `semanticRecall` using index `memory_messages`
  - `workingMemory` with `resource` scope

### 2.3 Knowledge RAG

- `vector-store-tools.ts` uses `AzureAISearchVector` for:
  - `query`
  - `upsert`
  - `listIndexes`
  - `describeIndex`
- Search tools available:
  - `search-documents`
  - `search-with-filters`
  - `advanced-search-documents`
- Important contract:
  - `metadata` is stored as JSON and is not filterable by default
  - demo filters only target explicit fields such as `id` and `content`
  - Azure-only capabilities belong to `advancedQuery()`, not `query()`

### 2.4 MCP in this demo

- No `mcpServers` are registered in `src`.
- `package.json` does not include `@mastra/mcp`.

Current state conclusion: **this demo is designed around internal RAG + internal memory, not agent-integrated MCP search**.

## 3) Internal RAG vs MCP search: architecture decision

### When to keep internal RAG (your current case)

- You need to validate `@mastra/azure-ai-search` inside real agent flows.
- You need control over indexing, explicit-field filters, scoring, and traceability.
- Your knowledge base is curated and should remain reproducible.

### When MCP search adds value

- You need to query external systems without reindexing everything inside this app.
- You want federated search across multiple remote backends.
- You want ingestion/runtime decoupling.

### Risk of enabling both without strategy

- Duplicate retrieval (higher latency and cost).
- Conflicting sources (internal RAG says A, MCP says B).
- Lower observability clarity if source origin is not explicit.

## 4) Recommendation for this demo

Keep this approach:

1. **Internal RAG as primary path** for `knowledge-base`.
2. **Semantic memory recall** as currently configured.
3. **MCP search as optional fallback** (not replacement), only when:
   - `resultsCount === 0`, or
   - top score is below threshold.

Suggested response policy:

- If internal RAG is used: cite local index titles/metadata.
- If MCP is used: mark source as external.
- If both are used: split sections into `Internal sources` and `External sources`.

## 5) Final verdict

For this demo, the current design is **coherent** with the goal of validating `@mastra/azure-ai-search`.

If you add MCP search, keep it as a complementary capability (fallback/federation), not a replacement for the internal RAG path being tested.

## References used

### Demo code

- `src/mastra/index.ts`
- `src/mastra/agents/knowledge-memory-agent.ts`
- `src/mastra/tools/vector-store-tools.ts`
- `src/mastra/agents/knowledge-agent.ts`
- `package.json`

### Installed types/implementation (node_modules)

- `node_modules/@mastra/core/dist/memory/types.d.ts`
- `node_modules/@mastra/memory/dist/index.js`
- `node_modules/@mastra/core/dist/mastra/index.d.ts`
- `node_modules/@mastra/memory/dist/docs/memory/02-storage.md`
- `node_modules/@mastra/memory/dist/docs/memory/05-semantic-recall.md`

### Official docs

- https://mastra.ai/docs/memory/overview
- https://mastra.ai/docs/memory/storage
- https://mastra.ai/docs/memory/semantic-recall
- https://mastra.ai/docs/mcp/overview
- https://mastra.ai/reference/mcp/client
- https://mastra.ai/reference/mcp/server
