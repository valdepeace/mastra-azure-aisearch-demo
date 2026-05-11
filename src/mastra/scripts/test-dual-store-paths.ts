import 'dotenv/config';
import { mastra } from '../index';
import {
  addDocumentTool,
  advancedSearchDocumentsTool,
  getIndexStatsTool,
  listIndexesTool,
} from '../tools/vector-store-tools';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const requireEnv = (name: string) => {
  if (!process.env[name]) {
    throw new Error(`Missing required env var: ${name}`);
  }
};

const runTool = async <TInput extends Record<string, unknown>>(tool: any, input: TInput) => {
  return tool.execute(input);
};

async function testMemoryUsesStore() {
  const agent = mastra.getAgent('knowledgeMemoryAgent');
  const runId = Date.now();
  const threadId = `dual-thread-${runId}`;
  const resourceId = `dual-resource-${runId}`;
  const marker = `UID_MEMORY_STORE_${runId}`;
  const memoryOptions = {
    lastMessages: 20,
    semanticRecall: {
      topK: 5,
      messageRange: 1,
      scope: 'resource' as const,
    },
    workingMemory: {
      enabled: false,
    },
    generateTitle: false,
  };

  const memory = await agent.getMemory();
  if (!memory) {
    throw new Error('knowledgeMemoryAgent has no memory instance');
  }

  await agent.generate(`Remember this exact identifier and reply only OK: ${marker}`, {
    memory: {
      thread: threadId,
      resource: resourceId,
      options: memoryOptions,
    },
  });

  await agent.generate('What was the exact identifier I asked you to remember?', {
    memory: {
      thread: threadId,
      resource: resourceId,
      options: memoryOptions,
    },
  });

  const recall = await memory.recall({
    threadId,
    resourceId,
    vectorSearchString: marker,
    threadConfig: {
      semanticRecall: {
        topK: 5,
        messageRange: 1,
        scope: 'resource',
      },
    },
  });

  if (!recall.messages.length) {
    throw new Error('Memory recall returned no messages for semantic search marker');
  }

  return {
    threadId,
    resourceId,
    marker,
    recalledMessages: recall.messages.length,
  };
}

async function testStoreAsTool() {
  const marker = `UID_TOOL_STORE_${Date.now()}`;

  const addResult = await runTool(addDocumentTool, {
    title: `Dual test doc ${marker}`,
    content: `Document to validate store-as-tool behavior. Marker: ${marker}`,
    category: 'technology',
    indexName: 'knowledge-base',
    tags: ['dual-test', 'tool-path', marker.toLowerCase()],
  });

  if (!addResult?.success) {
    throw new Error(`addDocumentTool failed: ${addResult?.error || 'unknown error'}`);
  }

  await sleep(2500);

  const searchResult = await runTool(advancedSearchDocumentsTool, {
    query: marker,
    indexName: 'knowledge-base',
    topK: 3,
    candidatePool: 25,
    contentContains: marker,
    includeMetadata: true,
  });

  if (!searchResult?.success) {
    throw new Error(`advancedSearchDocumentsTool failed: ${searchResult?.error || 'unknown error'}`);
  }

  if (!searchResult.resultsCount || searchResult.resultsCount < 1) {
    throw new Error('advancedSearchDocumentsTool returned no matching results');
  }

  const indexes = await runTool(listIndexesTool, {});
  if (!indexes?.success) {
    throw new Error(`listIndexesTool failed: ${indexes?.error || 'unknown error'}`);
  }

  const stats = await runTool(getIndexStatsTool, { indexName: 'knowledge-base' });
  if (!stats?.success) {
    throw new Error(`getIndexStatsTool failed: ${stats?.error || 'unknown error'}`);
  }

  return {
    marker,
    addedDocumentId: addResult.documentId,
    resultsCount: searchResult.resultsCount,
    indexCount: indexes.count,
    knowledgeBaseCount: stats.documentCount,
  };
}

async function main() {
  requireEnv('AZURE_AI_SEARCH_ENDPOINT');
  requireEnv('AZURE_AI_SEARCH_CREDENTIAL');
  requireEnv('OPENAI_API_KEY');

  console.log('Running dual validation: Memory uses store + Store as tool...');

  const memoryResult = await testMemoryUsesStore();
  console.log('Memory path OK:', memoryResult);

  const toolResult = await testStoreAsTool();
  console.log('Tool path OK:', toolResult);

  console.log('Dual validation completed successfully.');
}

main().catch((error) => {
  console.error('Dual validation failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});


