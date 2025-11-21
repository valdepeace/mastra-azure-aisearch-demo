/**
 * Tools for Azure AI Search Vector Store
 *
 * These tools allow an agent to interact with the vector store:
 * - Search documents by semantic similarity
 * - Insert new documents
 * - List available indexes
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { AzureAISearchVector } from '@mastra/aisearch';

// Configure the vector store
const vectorStore = new AzureAISearchVector({
  id: 'knowledge-base',
  endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT || '',
  credential: process.env.AZURE_AI_SEARCH_CREDENTIAL || '',
});

/**
 * Tool to search documents by semantic similarity
 */
export const searchDocumentsTool = createTool({
  id: 'search-documents',
  description:
    'Searches documents in the knowledge base using semantic search. Finds relevant documents based on the meaning of the query, not just keywords.',
  inputSchema: z.object({
    query: z.string().describe('The natural language search query'),
    indexName: z.string().default('knowledge-base').describe('Name of the index to search in'),
    topK: z.number().default(5).describe('Number of results to return'),
  }),
  execute: async ({ context }) => {
    try {
      const { query, indexName, topK } = context;

      // Generate embedding for the query
      if (!process.env.OPENAI_API_KEY) {
        return {
          success: false,
          error: 'OpenAI API key is not configured',
        };
      }

      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: query,
      });

      // Search in the vector store (no OData filters, metadata is JSON)
      const results = await vectorStore.query({
        indexName,
        queryVector: embedding,
        topK,
      });

      // Format results
      const formattedResults = results.map((r, i) => ({
        position: i + 1,
        score: r.score?.toFixed(4),
        title: r.metadata?.title || 'Untitled',
        content: r.document || 'No content',
        category: r.metadata?.category || 'No category',
        metadata: r.metadata,
      }));

      return {
        success: true,
        query,
        resultsCount: results.length,
        results: formattedResults,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error while searching documents',
      };
    }
  },
});

/**
 * Tool to insert new documents
 */
export const addDocumentTool = createTool({
  id: 'add-document',
  description:
    'Adds a new document to the knowledge base. The document will be indexed for semantic search.',
  inputSchema: z.object({
    title: z.string().describe('Document title'),
    content: z.string().describe('Document content'),
    category: z.string().describe('Document category (e.g., technology, science, business)'),
    indexName: z.string().default('knowledge-base').describe('Index name'),
    tags: z.array(z.string()).optional().describe('Additional tags'),
  }),
  execute: async ({ context }) => {
    try {
      const { title, content, category, indexName, tags } = context;

      if (!process.env.OPENAI_API_KEY) {
        return {
          success: false,
          error: 'OpenAI API key is not configured',
        };
      }

      // Generate embedding for the content
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: `${title}\n${content}`,
      });

      // Insert into the vector store
      const [documentId] = await vectorStore.upsert({
        indexName,
        vectors: [embedding],
        metadata: [
          {
            title,
            content,
            category,
            tags: tags || [],
            timestamp: new Date().toISOString(),
          },
        ],
      });

      return {
        success: true,
        message: 'Document added successfully',
        documentId,
        title,
        category,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error while adding document',
      };
    }
  },
});

/**
 * Tool to list available indexes
 */
export const listIndexesTool = createTool({
  id: 'list-indexes',
  description: 'Lists all available indexes in the vector store',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const indexes = await vectorStore.listIndexes();

      return {
        success: true,
        count: indexes.length,
        indexes,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error while listing indexes',
      };
    }
  },
});

/**
 * Tool to get index statistics
 */
export const getIndexStatsTool = createTool({
  id: 'get-index-stats',
  description: 'Gets statistics for a specific index (document count, dimension, etc.)',
  inputSchema: z.object({
    indexName: z.string().default('knowledge-base').describe('Index name'),
  }),
  execute: async ({ context }) => {
    try {
      const { indexName } = context;

      const stats = await vectorStore.describeIndex({ indexName });

      return {
        success: true,
        indexName,
        documentCount: stats.count,
        dimension: stats.dimension,
        metric: stats.metric,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error while getting index statistics',
      };
    }
  },
});

/**
 * Tool for searching with advanced filters
 * Note: Filters on metadata do not work because it is a JSON string
 */
export const searchWithFiltersTool = createTool({
  id: 'search-with-filters',
  description:
    'Semantic search in the knowledge base. You can search for information on different topics.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    indexName: z.string().default('knowledge-base').describe('Index name'),
    topK: z.number().default(5).describe('Number of results'),
  }),
  execute: async ({ context }) => {
    try {
      const { query, indexName, topK } = context;

      if (!process.env.OPENAI_API_KEY) {
        return {
          success: false,
          error: 'OpenAI API key is not configured',
        };
      }

      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: query,
      });

      const results = await vectorStore.query({
        indexName,
        queryVector: embedding,
        topK,
      });

      return {
        success: true,
        query,
        resultsCount: results.length,
        results: results.map((r, i) => ({
          position: i + 1,
          score: r.score?.toFixed(4),
          title: r.metadata?.title,
          content: (r.document || '').substring(0, 200) + '...',
          category: r.metadata?.category,
        })),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error while searching',
      };
    }
  },
});

// Export all tools
export const vectorStoreTools = {
  searchDocumentsTool,
  addDocumentTool,
  listIndexesTool,
  getIndexStatsTool,
  searchWithFiltersTool,
};
