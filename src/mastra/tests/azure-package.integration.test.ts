import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AzureAISearchVector } from '@mastra/azure-ai-search';

const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT;
const credential = process.env.AZURE_AI_SEARCH_CREDENTIAL;

const describeIfConfigured = endpoint && credential ? describe : describe.skip;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForMinimumDocuments({
  vectorStore,
  indexName,
  minCount,
  timeoutMs = 30000,
}: {
  vectorStore: AzureAISearchVector;
  indexName: string;
  minCount: number;
  timeoutMs?: number;
}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const stats = await vectorStore.describeIndex({ indexName });
    if (stats.count >= minCount) {
      return stats;
    }

    await sleep(1500);
  }

  throw new Error(`Index ${indexName} never reached ${minCount} documents within ${timeoutMs}ms`);
}

async function waitForQueryResult({
  vectorStore,
  indexName,
  queryVector,
  predicate,
  topK = 2,
  timeoutMs = 30000,
}: {
  vectorStore: AzureAISearchVector;
  indexName: string;
  queryVector: number[];
  predicate: (result: Awaited<ReturnType<AzureAISearchVector['query']>>[number]) => boolean;
  topK?: number;
  timeoutMs?: number;
}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const results = await vectorStore.query({
      indexName,
      queryVector,
      topK,
    });
    const match = results.find(predicate);

    if (match) {
      return match;
    }

    await sleep(1500);
  }

  throw new Error(`Query result for ${indexName} did not match predicate within ${timeoutMs}ms`);
}

describeIfConfigured('AzureAISearchVector integration for demo flow', () => {
  const indexName = `mastra-demo-${Date.now()}`;
  const dimension = 8;

  const vectors = [
    [1, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0],
  ];

  const metadata = [
    {
      title: 'Alpha Doc',
      content: 'Azure AI Search supports vector search and RAG.',
      category: 'technology',
      tags: ['azure', 'rag'],
    },
    {
      title: 'Beta Doc',
      content: 'Mastra can use Azure AI Search for semantic memory.',
      category: 'technology',
      tags: ['mastra', 'memory'],
    },
  ];

  const ids = ['doc-alpha', 'doc-beta'];
  let vectorStore: AzureAISearchVector;

  beforeAll(async () => {
    vectorStore = new AzureAISearchVector({
      id: 'azure-demo-integration',
      endpoint: endpoint!,
      credential: credential!,
    });

    await vectorStore.createIndex({
      indexName,
      dimension,
      metric: 'cosine',
    });
  }, 60000);

  afterAll(async () => {
    if (!vectorStore) {
      return;
    }

    try {
      await vectorStore.deleteIndex({ indexName });
    } catch {
      // Cleanup best effort.
    }
  }, 60000);

  it('should pass the method flow used by the demo implementation', async () => {
    await vectorStore.upsert({
      indexName,
      vectors,
      metadata,
      ids,
    });

    const indexes = await vectorStore.listIndexes();
    expect(indexes).toContain(indexName);

    const stats = await waitForMinimumDocuments({
      vectorStore,
      indexName,
      minCount: 2,
    });

    expect(stats.dimension).toBe(dimension);
    expect(stats.metric).toBe('cosine');

    const results = await vectorStore.query({
      indexName,
      queryVector: vectors[0],
      topK: 2,
    });

    expect(results.length).toBeGreaterThan(0);
    const returnedIds = results.map(result => result.id);
    expect(returnedIds).toEqual(expect.arrayContaining(ids));
  }, 90000);

  it('should allow filters only on explicit index fields used by the demo', async () => {
    const filteredById = await vectorStore.query({
      indexName,
      queryVector: vectors[0],
      topK: 2,
      filter: { eq: { id: 'doc-alpha' } },
    });

    expect(filteredById).toHaveLength(1);
    expect(filteredById[0]?.id).toBe('doc-alpha');

    const filteredByContent = await vectorStore.query({
      indexName,
      queryVector: vectors[0],
      topK: 2,
      filter: { contains: { content: 'semantic memory' } },
    });

    expect(filteredByContent.length).toBeGreaterThan(0);
    expect(filteredByContent.some(result => result.id === 'doc-beta')).toBe(true);

    await expect(
      vectorStore.query({
        indexName,
        queryVector: vectors[0],
        topK: 2,
        filter: { eq: { category: 'technology' } },
      }),
    ).rejects.toThrow(/JSON metadata is stored as a string|property named 'category'/i);
  }, 90000);

  it('should reject metadata-only queries without queryVector', async () => {
    await expect(
      vectorStore.query({
        indexName,
        topK: 1,
        filter: { eq: { id: 'doc-alpha' } },
      }),
    ).rejects.toThrow(/queryVector|vector cannot be null/i);
  }, 90000);

  it('should support advancedQuery with exhaustive HNSW search', async () => {
    const results = await vectorStore.advancedQuery({
      indexName,
      queryVector: vectors[0],
      topK: 2,
      exhaustiveSearch: true,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      id: expect.any(String),
      score: expect.any(Number),
    });
  }, 90000);

  it('should support updateVector by id', async () => {
    const updatedTitle = 'Alpha Doc Updated';

    await vectorStore.updateVector({
      indexName,
      id: 'doc-alpha',
      update: {
        metadata: {
          title: updatedTitle,
          content: 'Azure AI Search supports vector search and RAG.',
          category: 'technology',
          tags: ['azure', 'rag', 'updated'],
        },
      },
    });

    const alpha = await waitForQueryResult({
      vectorStore,
      indexName,
      queryVector: vectors[0],
      predicate: result => result.id === 'doc-alpha' && result.metadata?.title === updatedTitle,
    });

    expect(alpha.metadata?.title).toBe(updatedTitle);
  }, 90000);

  it('should support deleteVector (single) and deleteVectors (batch)', async () => {
    await vectorStore.deleteVector({ indexName, id: 'doc-beta' });
    await vectorStore.deleteVectors({ indexName, ids: ['doc-alpha'] });

    await sleep(3000);

    const stats = await vectorStore.describeIndex({ indexName });
    expect(stats.count).toBe(0);
  }, 90000);
});
