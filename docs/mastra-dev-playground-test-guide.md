# Mastra Dev Playground Test Guide

## Goal

Use the Mastra Dev Playground to manually validate the two main runtime paths in this demo:

1. **Memory path**: Mastra Memory stores conversation history, recalls relevant past messages, and persists user facts.
2. **Vector/RAG path**: Azure AI Search stores and retrieves knowledge base documents through the agent tools.

The main agent for these tests is:

- `Knowledge Assistant (Memory + Azure AI Search)`

## Prerequisites

Before starting the Playground:

1. Make sure `.env` contains:

   ```env
   AZURE_AI_SEARCH_ENDPOINT=https://<your-search-service>.search.windows.net
   AZURE_AI_SEARCH_CREDENTIAL=<your-search-key>
   OPENAI_API_KEY=<your-openai-key>
   ```

2. Start the Mastra dev server:

   ```bash
   npm run dev
   ```

3. Open the Mastra Dev UI URL printed by the command.

4. Select the `Knowledge Assistant (Memory + Azure AI Search)` agent.

## What Should Be Validated

This demo uses two Azure AI Search indexes for different responsibilities:

- `knowledge-base`: stores documents used for RAG/search.
- `memory_messages`: stores semantic message embeddings used by Mastra Memory.

The full conversation text is stored in LibSQL (`mastra.db`). Azure AI Search is used as the vector backend for semantic recall and document retrieval.

## Memory Tests

### 1. Exact Recall

Send:

```text
Remember this test code: MEM-PLAYGROUND-001.
```

Then send two or three unrelated messages, for example:

```text
What is Azure AI Search?
```

```text
Explain RAG in one paragraph.
```

Then ask:

```text
What test code did I give you earlier?
```

Expected result:

- The agent returns `MEM-PLAYGROUND-001`.
- The response should not invent a different code.
- The trace should show memory activity without runtime errors.

### 2. Semantic Recall

Send:

```text
My preferred framework for this demo is Mastra.
```

Then ask:

```text
Which tool or framework do I prefer for this demo?
```

Expected result:

- The agent answers `Mastra`.
- The answer can be based on meaning, not only exact keyword repetition.

### 3. Working Memory Preference

Send:

```text
Please remember that I prefer answers in English with numbered steps.
```

Then ask later:

```text
How do I prefer technical answers to be structured?
```

Expected result:

- The agent recalls that the preferred answer style is English with numbered steps.
- If the Playground supports resource/user selection, repeat this test using the same resource.

### 4. Irrelevant Memory Should Not Be Forced

Ask an unrelated question:

```text
What is the difference between vector search and keyword search?
```

Expected result:

- The agent answers the question normally.
- It should not force unrelated previous memories into the response.

### 5. Resource Isolation

If the Playground allows changing `resourceId` or user/resource context:

1. In resource A, send:

   ```text
   Remember this resource-specific code: RESOURCE-A-001.
   ```

2. Switch to resource B and ask:

   ```text
   What resource-specific code did I give you?
   ```

Expected result:

- Resource B should not recall `RESOURCE-A-001`.
- Memory should stay scoped to the configured resource.

## Vector / Knowledge Base Tests

### 1. List Available Indexes

Send:

```text
List the available Azure AI Search indexes.
```

Expected result:

- The agent uses `listIndexes`.
- `knowledge-base` should be present.
- `memory_messages` may be present if memory has already been used.

### 2. Get Knowledge Base Stats

Send:

```text
Get statistics for the knowledge-base index.
```

Expected result:

- The agent uses `getIndexStats`.
- The response includes document count, vector dimension, and metric if available.

### 3. Add A Test Document

Send:

```text
Add a document to the knowledge base with:
Title: Playground Vector Test
Category: technology
Content: The unique marker VECTOR-PLAYGROUND-001 validates semantic search through Azure AI Search in the Mastra Playground.
Tags: playground, vector, azure-search
```

Expected result:

- The agent uses `addDocument`.
- The tool returns success.
- A document id is returned.

### 4. Search By Unique Marker

Send:

```text
Search the knowledge base for VECTOR-PLAYGROUND-001.
```

Expected result:

- The agent uses `searchDocuments` or `advancedSearchDocuments`.
- The inserted document is returned.
- The answer cites the document title `Playground Vector Test`.

### 5. Semantic Search Without Exact Marker

Send:

```text
Find documents about validating semantic search in the Mastra Playground.
```

Expected result:

- The agent retrieves the test document even if the exact marker is not repeated.
- The result should be based on semantic similarity.

### 6. Advanced Search With Content Filter

Send:

```text
Use advancedSearchDocuments to search for "semantic search validation" with contentContains set to "VECTOR-PLAYGROUND-001".
```

Expected result:

- The agent uses `advancedSearchDocuments`.
- The applied filter targets the explicit `content` field.
- The inserted document is returned.

### 7. Metadata Filtering Limitation

Send:

```text
Search only documents where metadata.category equals technology.
```

Expected result:

- The agent should not rely on arbitrary metadata JSON filtering.
- The correct behavior is to explain that metadata is returned with results, but arbitrary metadata keys are not filterable by default in this demo.
- Supported filters should target explicit indexed fields such as `id` and `content`.

### 8. No Results Case

Send:

```text
Search the knowledge base for VECTOR-DOES-NOT-EXIST-999.
```

Expected result:

- The agent clearly says no relevant document was found.
- It may suggest a better query.
- It should not fabricate a source.

## Combined Memory + Vector Test

Send:

```text
Remember that I am validating the combined case MEMORY-VECTOR-001.
Now add a document titled "Combined Playground Case" with category technology and this content:
This document explains that MEMORY-VECTOR-001 validates conversational memory and vector search together in Mastra.
```

Then send:

```text
Which combined case am I validating, and which knowledge base document talks about it?
```

Expected result:

- The agent recalls `MEMORY-VECTOR-001` from memory.
- The agent searches the `knowledge-base` index.
- The answer cites `Combined Playground Case`.
- Traces should show both memory activity and a knowledge base tool call.

## Acceptance Criteria

The Playground validation passes when:

- The agent recalls exact markers after multiple turns.
- Semantic recall works even when the user changes wording.
- Working memory can persist user preferences.
- Memory does not inject unrelated past facts into unrelated answers.
- Memory is scoped correctly by resource/user when tested.
- `addDocument` writes to the `knowledge-base` index.
- `searchDocuments` or `advancedSearchDocuments` retrieves inserted documents.
- Responses cite document titles when using knowledge base results.
- The demo does not depend on arbitrary metadata JSON filtering.
- `memory_messages` is used for memory and `knowledge-base` is used for RAG documents.

