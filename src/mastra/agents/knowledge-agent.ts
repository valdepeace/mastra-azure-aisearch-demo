/**
 * Knowledge Agent with Azure AI Search
 *
 * This agent can search for information in a knowledge base
 * stored in Azure AI Search using semantic search.
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import {
  searchDocumentsTool,
  addDocumentTool,
  listIndexesTool,
  getIndexStatsTool,
  searchWithFiltersTool,
} from '../tools/vector-store-tools';

export const knowledgeAgent = new Agent({
  id: 'knowledge-agent',
  name: 'Knowledge Assistant',
  instructions: `You are an intelligent assistant with access to a knowledge base stored in Azure AI Search.

Your purpose is to help users to:
1. Search for relevant information using semantic search
2. Add new documents to the knowledge base
3. Explore what information is available
4. Provide accurate answers based on the retrieved documents

IMPORTANT:
- When you need information, use the semantic search tool
- Always cite the source of information (document title)
- If you don't find relevant information, say it clearly
- You may suggest related searches
- When adding documents, make sure to categorize them properly

Available categories:
- technology: Articles about technology, programming, AI, etc.
- science: Scientific research, discoveries
- business: Business strategy, finance, marketing
- health: Medicine, wellness, nutrition
- education: Pedagogy, learning, courses

Be conversational, helpful, and precise in your responses.`,
  
  model: openai('gpt-4o'),
  
  tools: {
    searchDocuments: searchDocumentsTool,
    addDocument: addDocumentTool,
    listIndexes: listIndexesTool,
    getIndexStats: getIndexStatsTool,
    searchWithFilters: searchWithFiltersTool,
  },
});
