/**
 * Knowledge Agent with Mastra Memory + Azure AI Search
 *
 * This agent:
 * - Uses Mastra Memory to store conversation history
 * - Uses Azure AI Search as the vector backend for semantic recall
 * - Can also use the vector-store tools to query the knowledge index
 */

import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { openai } from '@ai-sdk/openai';
import { CachedAzureAISearchVector } from '../stores/cached-azure-ai-search-vector';

import {
  searchDocumentsTool,
  addDocumentTool,
  listIndexesTool,
  getIndexStatsTool,
  searchWithFiltersTool,
  advancedSearchDocumentsTool,
} from '../tools/vector-store-tools';

// Vector store for MEMORY (separate from your "knowledge-base" index)
const memoryVectorStore = new CachedAzureAISearchVector({
  id: 'knowledge-memory',
  endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT || '',
  credential: process.env.AZURE_AI_SEARCH_CREDENTIAL || '',
});
export const knowledgeMemoryAgent = new Agent({
  id: 'knowledge-memory-agent',
  name: 'Knowledge Assistant (Memory + Azure AI Search)',
  instructions: `You are a smart knowledge assistant with:
- Mastra conversation memory
- Semantic recall powered by Azure AI Search
- Access to a knowledge base stored in Azure AI Search

Your goals:
1. Understand the user's questions and maintain conversational context.
2. When relevant, recall previous messages using semantic memory.
3. Use the knowledge base tools to retrieve accurate, grounded information.
4. Always explain which document or source you are using (document title).
5. If you don't find relevant information, say so clearly and suggest a better query.

Be conversational, precise, and explicit about which sources you used.`,
  model: openai('gpt-4o'),

  // Mastra Memory configuration
  memory: new Memory({
    // Storage is already configured at the Mastra root via LibSQLStore.
    // Here we only define vector + embedder + memory options.

    vector: memoryVectorStore,
    embedder: openai.embedding('text-embedding-3-small'),
    options: {
      // How many recent messages are always injected
      lastMessages: 20,

      // Enable semantic recall using Azure AI Search
      semanticRecall: {
        topK: 5,          // how many similar messages to retrieve
        messageRange: 2,  // surrounding context for each match
        scope: 'resource', // memory scoped per user (resourceId)
        indexName: 'memory_messages',
      },

      // Optional: working memory for persistent user facts
      workingMemory: {
        enabled: true,
        scope: 'resource',
        // you can customize the template later if needed
      },

      // Optional: automatic thread titles
      generateTitle: true,
    },
  }),

  // Tools to query / populate the knowledge index
  tools: {
    searchDocuments: searchDocumentsTool,
    addDocument: addDocumentTool,
    listIndexes: listIndexesTool,
    getIndexStats: getIndexStatsTool,
    searchWithFilters: searchWithFiltersTool,
    advancedSearchDocuments: advancedSearchDocumentsTool,
  },
});
