# Test Document for Mastra Upload

## Recommended Metadata

- title: `RAG Operations Guide with Azure AI Search and Mastra`
- category: `technology`
- tags:
  - `azure`
  - `rag`
  - `mastra`
  - `vector-search`
  - `demo`

## Content for the `content` field

This document describes a practical RAG (Retrieval Augmented Generation) implementation using Azure AI Search as the vector store and Mastra as the orchestration layer.

This approach uses two separate indexes:
1) `knowledge-base` for knowledge documents.
2) `memory_messages` for semantic conversation memory.

This separation of concerns improves traceability and response quality control. The `knowledge-base` index stores searchable content plus metadata serialized as JSON, such as title, category, and tags. The `memory_messages` index stores embeddings and message references, while full message text remains in transactional storage.

Recommended operating flow:
1) Insert curated documents into `knowledge-base`.
2) Generate consistent embeddings for both documents and queries.
3) Query by vector similarity with controlled `topK`.
4) Build final answers with explicit source citation.

Best practices:
- Define stable categories for organization; if you need filtering, expose them as explicit Azure index fields.
- Avoid very long documents; prefer clear semantic chunks.
- Version content when replacing documents.
- Monitor relevance/completeness with evaluations.

Example use case:
An internal technical assistant can answer questions about RAG implementation, indexing patterns, and semantic memory configuration. When a user asks "how to integrate Azure AI Search with Mastra", the system retrieves the most relevant passages and answers with grounded evidence.

Validation marker:
`UID_UPLOAD_MASTRA_AZURE_20260301_A1`

Exact-search control phrase:
`control-vector-skyline-42`

If this document was indexed correctly, queries containing either the UID or the control phrase should return this record among top results.

## Recommended verification queries

1) `UID_UPLOAD_MASTRA_AZURE_20260301_A1`
2) `control-vector-skyline-42`
3) `how to integrate Azure AI Search with Mastra in a RAG flow`
4) `difference between knowledge-base and memory_messages`

