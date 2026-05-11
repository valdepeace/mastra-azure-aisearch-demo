import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVectorStore = {
  query: vi.fn(),
  upsert: vi.fn(),
  listIndexes: vi.fn(),
  describeIndex: vi.fn(),
};

const embedMock = vi.fn();
const embeddingModelMock = vi.fn(() => 'mock-embedding-model');

vi.mock('@mastra/azure-ai-search', () => ({
  AzureAISearchVector: vi.fn(function AzureAISearchVectorMock() {
    return mockVectorStore;
  }),
}));

vi.mock('ai', () => ({
  embed: (...args: unknown[]) => embedMock(...args),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: {
    embedding: (...args: unknown[]) => embeddingModelMock(...args),
  },
}));

type ToolsModule = typeof import('../tools/vector-store-tools');
let tools: ToolsModule;

const runTool = async (tool: unknown, input: Record<string, unknown>) => {
  const execute = (tool as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute;
  return execute(input);
};

describe('vector-store-tools unit tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.OPENAI_API_KEY = 'test-key';
    tools = await import('../tools/vector-store-tools');
  });

  it('searchDocumentsTool should embed and query documents', async () => {
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    mockVectorStore.query.mockResolvedValue([
      {
        id: 'doc-1',
        score: 0.98765,
        document: 'Azure AI Search can power RAG systems.',
        metadata: {
          title: 'Azure AI Search Basics',
          category: 'technology',
        },
      },
    ]);

    const result = (await runTool(tools.searchDocumentsTool, {
      query: 'How does Azure AI Search work for RAG?',
      indexName: 'knowledge-base',
      topK: 3,
    })) as any;

    expect(embeddingModelMock).toHaveBeenCalledWith('text-embedding-3-small');
    expect(embedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 'How does Azure AI Search work for RAG?',
      }),
    );
    expect(mockVectorStore.query).toHaveBeenCalledWith({
      indexName: 'knowledge-base',
      queryVector: [0.1, 0.2, 0.3],
      topK: 3,
    });
    expect(result).toMatchObject({
      success: true,
      resultsCount: 1,
    });
    expect(result.results[0]).toMatchObject({
      position: 1,
      score: '0.9877',
      title: 'Azure AI Search Basics',
      category: 'technology',
    });
  });

  it('searchDocumentsTool should fail fast when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;

    const result = (await runTool(tools.searchDocumentsTool, {
      query: 'test',
      indexName: 'knowledge-base',
      topK: 5,
    })) as any;

    expect(result).toEqual({
      success: false,
      error: 'OpenAI API key is not configured',
    });
    expect(embedMock).not.toHaveBeenCalled();
    expect(mockVectorStore.query).not.toHaveBeenCalled();
  });

  it('addDocumentTool should upsert a generated embedding', async () => {
    embedMock.mockResolvedValue({ embedding: [0.9, 0.8, 0.7] });
    mockVectorStore.upsert.mockResolvedValue(['doc-123']);

    const result = (await runTool(tools.addDocumentTool, {
      title: 'Doc Title',
      content: 'Doc Content',
      category: 'technology',
      indexName: 'knowledge-base',
    })) as any;

    expect(mockVectorStore.upsert).toHaveBeenCalledWith({
      indexName: 'knowledge-base',
      vectors: [[0.9, 0.8, 0.7]],
      metadata: [
        expect.objectContaining({
          title: 'Doc Title',
          content: 'Doc Content',
          category: 'technology',
          tags: [],
          timestamp: expect.any(String),
        }),
      ],
    });
    expect(result).toMatchObject({
      success: true,
      documentId: 'doc-123',
      title: 'Doc Title',
      category: 'technology',
    });
  });

  it('listIndexesTool and getIndexStatsTool should expose vector store data', async () => {
    mockVectorStore.listIndexes.mockResolvedValue(['knowledge-base', 'memory_messages']);
    mockVectorStore.describeIndex.mockResolvedValue({
      dimension: 1536,
      count: 12,
      metric: 'cosine',
    });

    const indexesResult = (await runTool(tools.listIndexesTool, {})) as any;
    const statsResult = (await runTool(tools.getIndexStatsTool, {
      indexName: 'knowledge-base',
    })) as any;

    expect(indexesResult).toEqual({
      success: true,
      count: 2,
      indexes: ['knowledge-base', 'memory_messages'],
    });
    expect(statsResult).toEqual({
      success: true,
      indexName: 'knowledge-base',
      documentCount: 12,
      dimension: 1536,
      metric: 'cosine',
    });
  });

  it('searchWithFiltersTool should format truncated content and use only indexed filters', async () => {
    const longText = 'a'.repeat(250);

    embedMock.mockResolvedValue({ embedding: [0.3, 0.2, 0.1] });
    mockVectorStore.query.mockResolvedValue([
      {
        id: 'doc-filtered',
        score: 0.9,
        document: longText,
        metadata: {
          title: 'Filtered Doc',
          category: 'science',
        },
      },
    ]);

    const result = (await runTool(tools.searchWithFiltersTool, {
      query: 'filter query',
      indexName: 'knowledge-base',
      topK: 1,
      contentContains: 'aaaa',
    })) as any;

    expect(mockVectorStore.query).toHaveBeenCalledWith({
      indexName: 'knowledge-base',
      queryVector: [0.3, 0.2, 0.1],
      topK: 30,
      filter: {
        contains: {
          content: 'aaaa',
        },
      },
    });
    expect(result).toMatchObject({
      success: true,
      query: 'filter query',
      resultsCount: 1,
    });
    expect(result.results[0]).toMatchObject({
      title: 'Filtered Doc',
      category: 'science',
    });
    expect(result.results[0].content).toBe(`${'a'.repeat(200)}...`);
  });

  it('advancedSearchDocumentsTool should apply indexed filters and local score threshold', async () => {
    embedMock.mockResolvedValue({ embedding: [0.5, 0.4, 0.3] });
    mockVectorStore.query.mockResolvedValue([
      {
        id: 'doc-match',
        score: 0.88,
        document: 'RAG with Azure AI Search and Mastra orchestration',
        metadata: {
          title: 'Azure RAG Guide',
          category: 'technology',
          tags: ['azure', 'rag', 'mastra'],
        },
      },
      {
        id: 'doc-non-match',
        score: 0.55,
        document: 'Azure AI Search content with a weak score',
        metadata: {
          title: 'Business Planning',
          category: 'business',
          tags: ['planning'],
        },
      },
    ]);

    const result = (await runTool(tools.advancedSearchDocumentsTool, {
      query: 'azure rag',
      indexName: 'knowledge-base',
      topK: 3,
      candidatePool: 10,
      minScore: 0.7,
      id: 'doc-match',
      contentContains: 'Azure AI Search',
      includeMetadata: true,
    })) as any;

    expect(mockVectorStore.query).toHaveBeenCalledWith({
      indexName: 'knowledge-base',
      queryVector: [0.5, 0.4, 0.3],
      topK: 10,
      filter: {
        and: [
          {
            eq: {
              id: 'doc-match',
            },
          },
          {
            contains: {
              content: 'Azure AI Search',
            },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      success: true,
      query: 'azure rag',
      initialCandidates: 2,
      filteredCandidates: 1,
      resultsCount: 1,
    });
    expect(result.results[0]).toMatchObject({
      id: 'doc-match',
      title: 'Azure RAG Guide',
      category: 'technology',
    });
    expect(result.results[0].metadata).toEqual(
      expect.objectContaining({
        title: 'Azure RAG Guide',
      }),
    );
  });

  it('listIndexesTool should surface backend failures', async () => {
    mockVectorStore.listIndexes.mockRejectedValue(new Error('boom'));

    const result = (await runTool(tools.listIndexesTool, {})) as any;

    expect(result).toEqual({
      success: false,
      error: 'boom',
    });
  });
});
