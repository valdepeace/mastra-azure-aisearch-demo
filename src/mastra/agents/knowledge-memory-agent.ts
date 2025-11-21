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
import { AzureAISearchVector } from '@mastra/aisearch';

import {
  searchDocumentsTool,
  addDocumentTool,
  listIndexesTool,
  getIndexStatsTool,
  searchWithFiltersTool,
} from '../tools/vector-store-tools';

// Vector store for MEMORY (separate from your "knowledge-base" index)
const memoryVectorStore = new AzureAISearchVector({
  id: 'knowledge-memory',
  endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT || '',
  credential: process.env.AZURE_AI_SEARCH_CREDENTIAL || '',
  // ⚠️ Si en tu implementación has añadido soporte para index por defecto,
  // aquí podrías pasar algo como:
  // indexName: 'mastra-conversation-memory'
  //
  // Si no, asegúrate de que dentro de AzureAISearchVector, cuando se use
  // como MastraVector, use un índice distinto a "knowledge-base"
});
const memoryVector = azureVector as unknown as MastraVector<VectorFilter>;
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

  // 🔥 Mastra Memory configuration
  memory: new Memory({
    // Storage ya lo tienes configurado en el Mastra root con LibSQLStore
    // Aquí solo definimos vector + embedder + opciones

    vector: memoryVectorStore,
    embedder: openai.embedding('text-embedding-3-small'),
    options: {
      // cuántos mensajes recientes se inyectan siempre
      lastMessages: 20,

      // activar semantic recall usando Azure AI Search
      semanticRecall: {
        topK: 5,          // cuántos mensajes similares recuperar
        messageRange: 2,  // contexto alrededor de cada match
        scope: 'resource' // memoria por usuario (resourceId)
      },

      // opcional: working memory para hechos persistentes del usuario
      workingMemory: {
        enabled: true,
        scope: 'resource',
        // puedes customizar el template más adelante si quieres
      },

      // opcional: títulos automáticos de hilos
      threads: {
        generateTitle: true,
      },
    },
  }),

  // Herramientas para consultar / poblar el índice de conocimiento
  tools: {
    searchDocuments: searchDocumentsTool,
    addDocument: addDocumentTool,
    listIndexes: listIndexesTool,
    getIndexStats: getIndexStatsTool,
    searchWithFilters: searchWithFiltersTool,
  },
});
