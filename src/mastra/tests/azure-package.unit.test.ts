/**
 * Unit tests for @mastra/azure-ai-search from the demo's perspective.
 *
 * Scope: things testable without mocking the Azure SDK (pnpm link makes
 * vi.mock('@azure/search-documents') unreliable across package boundaries).
 * SDK-level mocking lives in the monorepo: stores/azure/src/vector/index.test.ts
 *
 * What we cover here:
 * - AzureAISearchFilterTranslator — pure logic, no SDK
 * - Input-validation errors and SDK boundary failures surfaced to consumers
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { AzureAISearchFilterTranslator, AzureAISearchVector } from '@mastra/azure-ai-search';

describe('AzureAISearchFilterTranslator', () => {
  it('passes through raw $filter strings unchanged', () => {
    const t = new AzureAISearchFilterTranslator();
    expect(t.translate({ $filter: "id eq 'doc1'" })).toBe("id eq 'doc1'");
  });

  it('translates legacy contains to search.ismatch', () => {
    const t = new AzureAISearchFilterTranslator();
    expect(t.translate({ contains: { content: 'test' } })).toBe("search.ismatch('test', 'content')");
  });

  it('translates Mastra $and/$eq/$exists filter syntax to OData', () => {
    const t = new AzureAISearchFilterTranslator();
    expect(
      t.translate({ $and: [{ id: { $eq: 'doc1' } }, { content: { $exists: true } }] }),
    ).toBe("(id eq 'doc1' and content ne null)");
  });

  it('translates legacy endsWith', () => {
    const t = new AzureAISearchFilterTranslator();
    expect(t.translate({ endsWith: { content: 'pdf' } })).toBe("endswith(content, 'pdf')");
  });

  it('translates legacy startsWith', () => {
    const t = new AzureAISearchFilterTranslator();
    expect(t.translate({ startsWith: { content: 'azure' } })).toBe("startswith(content, 'azure')");
  });

  it('translates legacy eq filter', () => {
    const t = new AzureAISearchFilterTranslator();
    expect(t.translate({ eq: { id: 'doc1' } })).toBe("id eq 'doc1'");
  });

  it('translates legacy and with multiple conditions', () => {
    const t = new AzureAISearchFilterTranslator();
    expect(
      t.translate({ and: [{ eq: { id: 'doc1' } }, { contains: { content: 'azure' } }] }),
    ).toBe("(id eq 'doc1' and search.ismatch('azure', 'content'))");
  });

  it('returns undefined for empty/nullish input', () => {
    const t = new AzureAISearchFilterTranslator();
    expect(t.translate(undefined)).toBeUndefined();
  });
});

describe('AzureAISearchVector — consumer-facing validation failures', () => {
  let vectorStore: AzureAISearchVector;

  beforeEach(() => {
    vectorStore = new AzureAISearchVector({
      id: 'unit-test',
      endpoint: 'https://test.search.windows.net',
      credential: 'test-key',
    });
  });

  it('rejects upsert with empty vectors array before any SDK call', async () => {
    await expect(
      vectorStore.upsert({ indexName: 'test-index', vectors: [] }),
    ).rejects.toThrow();
  });

  it('rejects upsert when metadata length does not match vectors length', async () => {
    await expect(
      vectorStore.upsert({
        indexName: 'test-index',
        vectors: [[0.1, 0.2, 0.3]],
        metadata: [{ a: 1 }, { b: 2 }],
      }),
    ).rejects.toThrow();
  });

  it('rejects query without queryVector', async () => {
    await expect(
      vectorStore.query({ indexName: 'test-index', filter: { eq: { id: 'doc1' } }, topK: 5 }),
    ).rejects.toThrow(/queryVector|vector cannot be null/i);
  });
});
