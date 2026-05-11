# Test Battery for `@mastra/azure-ai-search` in This Demo

## Goal

Validate two things:

1. `@mastra/azure-ai-search` works correctly in the real flows used by this demo.
2. The demo documents the current adapter contract accurately, especially around filters, `metadata`, and `advancedQuery()`.

## Current Demo Coverage

Public API of `AzureAISearchVector` vs real usage in this demo:

| Method | Used in demo | Where |
| --- | --- | --- |
| `createIndex` | Yes | `populate-knowledge-base.ts` |
| `upsert` | Yes | `populate-knowledge-base.ts`, `vector-store-tools.ts`, Memory (indirect) |
| `query` | Yes | `vector-store-tools.ts`, Memory (indirect) |
| `listIndexes` | Yes | `vector-store-tools.ts` |
| `describeIndex` | Yes | `populate-knowledge-base.ts`, `vector-store-tools.ts` |
| `deleteIndex` | No | Only used in integration cleanup |
| `updateVector` | No | Not implemented in demo runtime flow |
| `deleteVector` / `deleteVectors` | No | Not implemented in demo runtime flow |
| `createAdvancedIndex` | No | Not implemented in demo runtime flow |
| `advancedQuery` | No | Reserved for Azure-specific features, not used in the default demo flow |
| `semanticQuery` | No | Not implemented in demo runtime flow |
| `hybridQuery` | No | Not implemented in demo runtime flow |
| `multiVectorQuery` | No | Not implemented in demo runtime flow |
| `exactQuery` | No | Not implemented in demo runtime flow |
| `fromConnectionString` | No | Not implemented in demo runtime flow |

## Contract Guardrails Covered by This Demo

- `metadata` is stored as a JSON string.
- The demo does not depend on filtering arbitrary keys inside `metadata`.
- Filters in the runtime flow only target explicit index fields used by the adapter today: `id` and `content`.
- `query()` is always called with `queryVector`.
- Azure-specific capabilities remain a concern of `advancedQuery()`, not `query()`.

## Automated Suite Added

### 1) Unit tests (no real Azure required)

File: `src/mastra/tests/vector-store-tools.unit.test.ts`

Validates:

- `searchDocumentsTool`:
  - generates embeddings
  - calls `query`
  - formats results
  - fails correctly when `OPENAI_API_KEY` is missing
- `addDocumentTool`:
  - generates embedding
  - calls `upsert`
  - returns `documentId`
- `listIndexesTool` and `getIndexStatsTool`:
  - expose vector store responses
  - propagate backend errors
- `searchWithFiltersTool`:
  - uses only indexed-field filters
  - returns truncated content correctly
- `advancedSearchDocumentsTool`:
  - uses only indexed-field filters
  - applies `minScore` locally after the vector query

### 2) Static implementation coverage for this demo

File: `src/mastra/tests/azure-implementation-coverage.unit.test.ts`

Validates:

- which `AzureAISearchVector` methods appear in this demo codebase
- that this demo currently covers the expected method subset
- that Azure-only options are not passed through `query()`
- that the README states the filter and metadata limitations explicitly

### 3) Integration test (real Azure, conditional)

File: `src/mastra/tests/azure-package.integration.test.ts`

Runs only if these env vars are set:

- `AZURE_AI_SEARCH_ENDPOINT`
- `AZURE_AI_SEARCH_CREDENTIAL`

Validated flow:

- `createIndex`
- `upsert`
- `listIndexes`
- `describeIndex`
- `query`
- valid filters on `id` and `content`
- rejection of filters on non-indexed metadata keys
- rejection of metadata-only queries without `queryVector`
- cleanup with `deleteIndex`

## Commands

From project root:

```bash
pnpm run test:azure:unit
pnpm run test:azure:integration
pnpm run test:azure:battery
pnpm run test:azure:dual
```

## Dual Validation (Core Demo Objective)

This command validates both key capabilities explicitly:

1. **Mastra using the store (Memory + semantic recall)**
   - Executes real turns with `knowledgeMemoryAgent`
   - Verifies `memory.recall(...)` using `vectorSearchString` against `memory_messages`
2. **Store used as a tool (knowledge-base RAG)**
   - Inserts a document via `addDocumentTool`
   - Retrieves it via `advancedSearchDocumentsTool`
   - Uses `contentContains` on the explicit `content` field
   - Verifies introspection via `listIndexesTool` and `getIndexStatsTool`

Script:

- `src/mastra/scripts/test-dual-store-paths.ts`

## Manual Tests in Mastra Dev UI

With `pnpm run dev`, test the `Knowledge Assistant (Memory + Azure AI Search)` agent:

### A) Memory path (Mastra uses the store)

1. Send a unique marker:
   - `Remember this code: MEM-20260301-AAA`
2. Send 1-2 unrelated follow-up messages.
3. Ask for recall:
   - `What was the code I gave you at the beginning?`
4. Validate:
   - returns the exact marker
   - traces show memory/recall activity without errors

### B) Tool path (store as a tool)

1. Insert a document with a unique marker:
   - ask the agent to use `addDocument` with content containing `TOOL-20260301-BBB`
2. Search for that marker:
   - `Search TOOL-20260301-BBB using advancedSearchDocuments`
3. Validate:
   - at least one matching result is returned
   - tool calls include `addDocument` and `advancedSearchDocuments`
   - no `@mastra/azure-ai-search` runtime errors
   - the search path relies on `queryVector` plus an indexed `content` filter, not metadata filtering

## Acceptance Criteria

To consider `@mastra/azure-ai-search` correct for this demo:

- `test:azure:unit` passes
- `test:azure:integration` passes (or is skipped only if credentials are missing)
- `test:azure:dual` passes (runtime validation of Memory + Tool paths)
- `mastra dev` runtime shows healthy memory and tool-call flows
- the demo does not depend on arbitrary metadata JSON filtering
- Azure-only features remain scoped to `advancedQuery()`
