# Mastra + Azure AI Search Demo

 **Note:** This is a demo project to test the integration of Azure AI Search with Mastra. The package name we are using for testing is **not final**. Currently, we use:
```json
"@mastra/aisearch": "link:E:/workspace/personal/mastra/stores/aisearch"
```
This package points to the repository:
https://github.com/valdepeace/mastra/tree/main/stores/aisearch

This demo shows how to use **Azure AI Search** as a vector store inside **Mastra** for:

- A **knowledge base** (RAG over documents), and  
- **Semantic conversation memory** for an agent.

It also uses **LibSQL** as the primary storage for conversations, scores and traces.

---

## 1. High-level architecture

```text
                ┌──────────────────────────────┐
                │          Mastra App          │
                │                              │
                │  • Agents (knowledge, memory)│
User ───────▶   │  • Memory                    │
                │  • Tools (search/add docs)   │
                └──────────┬───────────────────┘
                           │
                ┌──────────┴───────────┐
                │      LibSQLStore     │
                │  (mastra.db)         │
                │                      │
                │  - Full messages     │
                │  - Threads/resources │
                │  - Evals & traces    │
                └──────────┬───────────┘
                           │
          ┌────────────────┴─────────────────┐
          │                                  │
┌─────────▼───────────┐           ┌──────────▼───────────┐
│ Azure AI Search     │           │ Azure AI Search      │
│ Index: knowledge-   │           │ Index: memory_       │
│ base                │           │ messages             │
│                     │           │                      │
│ - Vector embeddings │           │ - Vector embeddings  │
│ - Document content  │           │ - message_id,        │
│ - Metadata (title,  │           │   thread_id, etc.    │
│   category, tags…)  │           │ - content = ""       │
└─────────────────────┘           └──────────────────────┘
````

* **Knowledge base index (`knowledge-base`)**
  Used for RAG. Stores **documents + embeddings**.

* **Memory index (`memory_messages`)**
  Used only as a **semantic index of past messages**.
  Stores **embeddings + references** (`message_id`, `thread_id`, `resource_id`).
  The full message text is stored in **LibSQL**, not in the vector index.

This design keeps conversations focused: when the user asks something new, the agent retrieves only the **most semantically relevant past messages**, instead of dumping the whole history.

---

## 2. Components

### 2.1. AzureAISearchVector (`@mastra/aisearch`)

`AzureAISearchVector` is a `MastraVector` implementation that uses **Azure AI Search** for vector storage and similarity search.

Example usage:

```ts
import { AzureAISearchVector } from '@mastra/aisearch';

const vectorStore = new AzureAISearchVector({
  id: 'azure-ai-search',
  endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT!,
  credential: process.env.AZURE_AI_SEARCH_CREDENTIAL!,
});
```

Used in two places:

* As a **tool-backed store** for the knowledge base (`knowledge-base`).
* As the **vector backend for Memory** (`memory_messages`).

### 2.2. Knowledge Agent (tools + RAG)

`knowledgeAgent` uses tools such as:

* `searchDocuments` – semantic search over `knowledge-base`
* `addDocument` – insert new documents
* `listIndexes` / `getIndexStats` – introspection of the vector store

Prompts are answered using **documents retrieved via Azure AI Search**.

### 2.3. Knowledge Memory Agent (Memory + RAG)

`knowledgeMemoryAgent` combines:

* **Mastra Memory** (conversation memory) with:

  * `semanticRecall` (vector search over `memory_messages`)
  * `workingMemory` (persistent user facts)
* **Knowledge base tools** for RAG over `knowledge-base`.

Memory configuration example:

```ts
memory: new Memory({
  vector: azureMemoryVector,          // AzureAISearchVector for memory_messages
  embedder: openai.embedding('text-embedding-3-small'),
  options: {
    semanticRecall: {
      topK: 5,          // how many similar messages to recall
      messageRange: 2,  // how many neighbour messages around each match
      scope: 'resource' // memory per resource (user)
    },
    workingMemory: {
      enabled: true,
      scope: 'resource',
    },
  },
})
```

**Important behaviour**

* For each new message:

  1. Mastra stores the **full message** in LibSQL.
  2. Computes an embedding and upserts it into Azure AI Search (`memory_messages`)
     with metadata `{ message_id, thread_id, resource_id }`.
* On semantic recall:

  1. Embeds the new query.
  2. Queries `memory_messages` for similar vectors.
  3. Uses `message_id` to fetch the full text from LibSQL.
  4. Injects only the relevant messages into the prompt.

This keeps the conversation **on topic** and avoids the model going into loops.

---

## 3. Setup

### 3.1. Requirements

* Node.js ≥ 22.x (Mastra requirement)
* Azure AI Search service
* OpenAI API key (or compatible provider through `@ai-sdk/openai`)

### 3.2. Environment variables

Create a `.env` file in the project root:

```env
AZURE_AI_SEARCH_ENDPOINT=https://<your-search-service>.search.windows.net
AZURE_AI_SEARCH_CREDENTIAL=<your-search-admin-or-query-key>

OPENAI_API_KEY=<your-openai-key>
```

---

## 4. Storage configuration (LibSQL)

Mastra uses `LibSQLStore` for persistent storage:

```ts
import { LibSQLStore } from '@mastra/libsql';

export const mastra = new Mastra({
  // ...
  storage: new LibSQLStore({
    // Local file; usually created inside .mastra and gitignored
    url: 'file:./.mastra/mastra.db',
  }),
});
```

This database stores:

* Conversations (full messages)
* Memory metadata (including `message_id`)
* Scores (evals)
* Traces/observability data

---

## 5. Populate the knowledge base

You have a script similar to:

```ts
// src/scripts/populateKnowledgeBase.ts
import 'dotenv/config';
import { AzureAISearchVector } from '@mastra/aisearch';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

// sampleDocuments[...] // (English articles about AI, RAG, etc.)

async function populateKnowledgeBase() {
  const vectorStore = new AzureAISearchVector({
    id: 'knowledge-base-populator',
    endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT!,
    credential: process.env.AZURE_AI_SEARCH_CREDENTIAL!,
  });

  const indexName = 'knowledge-base';

  await vectorStore.createIndex({
    indexName,
    dimension: 1536,
    metric: 'cosine',
  });

  // generate embeddings with OpenAI
  const embeddings = [];
  for (const doc of sampleDocuments) {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: `${doc.title}\n${doc.content}`,
    });
    embeddings.push(embedding);
  }

  await vectorStore.upsert({
    indexName,
    vectors: embeddings,
    metadata: sampleDocuments.map(doc => ({
      title: doc.title,
      content: doc.content,
      category: doc.category,
      tags: doc.tags,
      timestamp: new Date().toISOString(),
    })),
  });
}

populateKnowledgeBase().catch(console.error);
```

Add a script in `package.json` and run, for example:

```bash
npm run populate:knowledge
# or
npx tsx src/scripts/populateKnowledgeBase.ts
```

After this, in the Azure portal you should see:

* Index `knowledge-base` with your documents.
* Index `memory_messages` will be filled gradually as you chat with the memory agent.

---

## 6. Running the Mastra dev server

Start the dev server:

```bash
npm run mastra:dev
# or whatever command you use, e.g.
npx mastra dev
```

The CLI will show the URL of the **Mastra Dev UI**.

In the Dev UI:

1. Open the **Knowledge Assistant (Memory + Azure AI Search)** agent.
2. Send a few messages, for example:

   * `Explain what RAG is and how it works.`
   * `Now, based on that, how can I implement it with Azure AI Search?`
   * `Remember what you said earlier about RAG and suggest 3 advanced topics I should study next.`

You should see:

* Tool calls to `search-documents` hitting the `knowledge-base` index.
* Memory reads/writes using the `memory_messages` index.
* Conversations staying **focused on the topic** instead of looping.

---

## 7. How to describe this in the PR

You can summarise the behaviour like this:

> This PR adds `@mastra/aisearch`, a `MastraVector` implementation backed by Azure AI Search.
>
> It is used both as:
>
> * a vector store for a **knowledge base** (`knowledge-base` index) that powers RAG, and
> * the vector backend for **Mastra Memory** (`memory_messages` index).
>
> Memory uses Azure AI Search as a semantic index of past messages (embeddings + message IDs), while LibSQL remains the source of truth for full message content.
> This allows the agent to recall only the most relevant past messages, keeping conversations focused and avoiding repetitive loops.

---

That should give you a complete, coherent README that explica bien:

* qué hace el store,
* cómo interactúa con Memory,
* qué índices crea,
* y por qué la conversación ahora se siente mucho más centrada.
