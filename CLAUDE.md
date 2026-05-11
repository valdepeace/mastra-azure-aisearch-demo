# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start Mastra Dev UI (localhost playground)
pnpm build            # Build for production
pnpm start            # Run production build

pnpm populate         # Seed knowledge-base index with 12 sample docs (run once after env setup)

pnpm test             # All tests
pnpm test:watch       # Watch mode
pnpm test:azure:unit  # Unit tests only (mocked, no real Azure)
pnpm test:azure:integration  # Integration tests (requires real Azure creds)
pnpm test:azure:battery      # Unit + integration combined
```

Single test file: `pnpm vitest run src/mastra/tests/<file>.test.ts`

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
OPENAI_API_KEY=               # text-embedding-3-small + GPT-4o/mini
AZURE_AI_SEARCH_ENDPOINT=     # https://your-service.search.windows.net
AZURE_AI_SEARCH_CREDENTIAL=   # Azure search admin/query key
```

## Test Strategy

This demo is a **consumer test harness** for `@mastra/azure-ai-search` (linked from the monorepo at `E:\workspace\personal\mastra\stores\azure`). Tests are layered:

| File | What it tests |
|------|--------------|
| `vector-store-tools.unit.test.ts` | Demo's tools layer (mocks `@mastra/azure-ai-search` entirely) |
| `azure-package.unit.test.ts` | `@mastra/azure-ai-search` filter translator + input validation (pure logic, no SDK). pnpm link prevents `vi.mock('@azure/search-documents')` from intercepting inside the linked package — SDK-level mocking stays in the monorepo's own `index.test.ts` |
| `azure-implementation-coverage.unit.test.ts` | Validates which package methods the demo runtime uses vs. what's available |
| `azure-package.integration.test.ts` | Full API surface against real Azure (requires env vars) |

When the monorepo's `stores/azure/src/vector/index.test.ts` changes, update `azure-package.unit.test.ts` to match.

## Architecture

**Mastra framework** demo integrating Azure AI Search vector store with LibSQL for storage.

### Two-Index Design

| Index | Purpose |
|-------|---------|
| `knowledge-base` | RAG over seeded documents (1536-dim cosine) |
| `memory_messages` | Semantic recall of past conversation messages |

The `memory_messages` index stores embeddings + metadata only — full message text lives in LibSQL (`./mastra.db`). This allows semantic recall without dumping entire conversation history into context.

### Agent Roles

- **knowledge-agent** (`src/mastra/agents/knowledge-agent.ts`) — Stateless RAG. Uses all six vector-store tools. No memory.
- **knowledge-memory-agent** (`src/mastra/agents/knowledge-memory-agent.ts`) — RAG + persistent memory. Memory config: last 20 messages always injected, semantic recall topK=5 with 2-message surrounding context, scope=`resource` (per-user), working memory enabled.
- **weather-agent** (`src/mastra/agents/weather-agent.ts`) — Weather assistant (GPT-4o-mini). Three attached scorers evaluated at 100% sampling rate.

### Vector Store Tools (`src/mastra/tools/vector-store-tools.ts`)

Six tools, all backed by `AzureAISearchVector` from `@mastra/azure-ai-search`:

1. `searchDocumentsTool` — semantic search
2. `addDocumentTool` — upsert with auto-embedding
3. `listIndexesTool` — list indexes
4. `getIndexStatsTool` — count, dimension, metric
5. `searchWithFiltersTool` — search + filter on indexed fields only (`id`, `content`)
6. `advancedSearchDocumentsTool` — exposes candidate pool / score threshold controls

**Metadata limitation:** metadata stored as JSON strings, not individual filterable fields. Filters only work on `id` and `content`. This is by design and tested in `azure-implementation-coverage.unit.test.ts`.

### Dependency Note

`@mastra/azure-ai-search` is linked from local monorepo (`file:../../packages/rag/azure`), not published npm. The package is under active development.

### Scoring

`src/mastra/scorers/weather-scorer.ts` defines three scorers wired to weather-agent:
- `toolCallAppropriateness` — verifies weatherTool called correctly
- `completeness` — built-in Mastra completeness eval
- `translationScorer` — LLM-judged (GPT-4o-mini) for non-English location name quality

### Data Flow

```
User → Agent → Vector Tools → AzureAISearchVector (embeddings via OpenAI)
                            → Memory (LibSQL for messages, Azure index for semantic recall)
                            → Scorers (async evaluation after response)
```
