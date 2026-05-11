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
import { AzureAISearchVector } from '@mastra/azure-ai-search';

// Configure the vector store
const vectorStore = new AzureAISearchVector({
  id: 'knowledge-base',
  endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT || '',
  credential: process.env.AZURE_AI_SEARCH_CREDENTIAL || '',
});

const truncateWithEllipsis = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;

const buildIndexedFilter = ({
  id,
  contentContains,
}: {
  id?: string;
  contentContains?: string;
}) => {
  const filters: Array<Record<string, unknown>> = [];

  if (id) {
    filters.push({ eq: { id } });
  }

  if (contentContains) {
    filters.push({ contains: { content: contentContains } });
  }

  if (filters.length === 0) {
    return undefined;
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return { and: filters };
};

const advancedSearchInputSchema = z.object({
  query: z.string().describe('Search query'),
  indexName: z.string().default('knowledge-base').describe('Index name'),
  topK: z.number().int().min(1).max(50).default(5).describe('Final number of results'),
  candidatePool: z
    .number()
    .int()
    .min(5)
    .max(200)
    .default(30)
    .describe('How many semantic candidates to retrieve before applying filters'),
  minScore: z.number().min(0).max(1).optional().describe('Minimum similarity score'),
  id: z.string().optional().describe('Exact document id filter using the real Azure field'),
  contentContains: z
    .string()
    .optional()
    .describe('Content substring filter using the real Azure `content` field'),
  includeMetadata: z.boolean().default(true).describe('Whether to include full metadata in results'),
  maxContentLength: z
    .number()
    .int()
    .min(50)
    .max(3000)
    .default(200)
    .describe('Maximum characters to return for content preview'),
});

type AdvancedSearchInput = z.infer<typeof advancedSearchInputSchema>;

const runAdvancedSearch = async ({
  query,
  indexName = 'knowledge-base',
  topK = 5,
  candidatePool = 30,
  minScore,
  id,
  contentContains,
  includeMetadata = true,
  maxContentLength = 200,
}: AdvancedSearchInput) => {
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

  const semanticTopK = Math.max(topK, candidatePool);
  const results = await vectorStore.query({
    indexName,
    queryVector: embedding,
    topK: semanticTopK,
    filter: buildIndexedFilter({
      id,
      contentContains,
    }),
  });

  const filtered = results.filter((r) => {
    const score = typeof r.score === 'number' ? r.score : 0;
    return typeof minScore !== 'number' || score >= minScore;
  });

  const finalResults = filtered.slice(0, topK);

  return {
    success: true,
    query,
    initialCandidates: results.length,
    filteredCandidates: filtered.length,
    resultsCount: finalResults.length,
    appliedFilters: {
      minScore,
      id: id || undefined,
      contentContains: contentContains || undefined,
    },
    results: finalResults.map((r, i) => ({
      position: i + 1,
      id: r.id,
      score: typeof r.score === 'number' ? r.score.toFixed(4) : undefined,
      title: r.metadata?.title,
      content: truncateWithEllipsis(r.document || '', maxContentLength),
      category: r.metadata?.category,
      metadata: includeMetadata ? r.metadata : undefined,
    })),
  };
};

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
  execute: async ({ query, indexName, topK }) => {
    try {
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
  execute: async ({ title, content, category, indexName, tags }) => {
    try {
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
  execute: async ({ indexName }) => {
    try {
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
 * Tool for searching with basic post-filters
 */
export const searchWithFiltersTool = createTool({
  id: 'search-with-filters',
  description:
    'Semantic search with filters that only target real Azure AI Search fields (`id` and `content`).',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    indexName: z.string().default('knowledge-base').describe('Index name'),
    topK: z.number().int().min(1).max(50).default(5).describe('Final number of results'),
    minScore: z.number().min(0).max(1).optional().describe('Minimum similarity score'),
    id: z.string().optional().describe('Exact document id filter'),
    contentContains: z.string().optional().describe('Substring match on the indexed `content` field'),
  }),
  execute: async ({ query, indexName, topK, minScore, id, contentContains }) => {
    try {
      const candidatePool = Math.min(200, Math.max(30, topK * 6));
      return await runAdvancedSearch({
        query,
        indexName,
        topK,
        candidatePool,
        minScore,
        id,
        contentContains,
        includeMetadata: false,
        maxContentLength: 200,
      });
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error while searching',
      };
    }
  },
});

/**
 * Tool for advanced semantic search with indexed filters only
 */
export const advancedSearchDocumentsTool = createTool({
  id: 'advanced-search-documents',
  description:
    'Advanced semantic search with candidate-pool controls and filters on explicit index fields only.',
  inputSchema: advancedSearchInputSchema,
  execute: async (input) => {
    try {
      return await runAdvancedSearch(input);
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
  advancedSearchDocumentsTool,
};
