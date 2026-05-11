import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DEMO_FILES = [
  'src/mastra/scripts/populate-knowledge-base.ts',
  'src/mastra/tools/vector-store-tools.ts',
  'src/mastra/agents/knowledge-memory-agent.ts',
];

const PUBLIC_AZURE_API_METHODS = [
  'fromConnectionString',
  'createIndex',
  'createAdvancedIndex',
  'listIndexes',
  'describeIndex',
  'deleteIndex',
  'upsert',
  'query',
  'advancedQuery',
  'updateVector',
  'deleteVectors',
  'deleteVector',
  'semanticQuery',
  'hybridQuery',
  'multiVectorQuery',
  'exactQuery',
];

const DEMO_EXPECTED_METHODS = ['createIndex', 'upsert', 'query', 'listIndexes', 'describeIndex'];
const QUERY_ONLY_ADVANCED_KEYS = [
  'useSemanticSearch',
  'semanticOptions',
  'queryType',
  'textVectorization',
  'additionalVectorQueries',
  'filterMode',
  'oversampling',
  'weight',
  'exhaustiveSearch',
];

const getDemoContent = () =>
  DEMO_FILES.map(file => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');

const getDemoMethodUsage = () => {
  const content = getDemoContent();
  const methodRegex = /\b(?:vectorStore|memoryVectorStore)\.(\w+)\(/g;
  const methods = new Set<string>();

  let match = methodRegex.exec(content);
  while (match) {
    methods.add(match[1]);
    match = methodRegex.exec(content);
  }

  return methods;
};

describe('azure implementation coverage in this demo', () => {
  it('should use the expected AzureAISearchVector methods', () => {
    const usedMethods = Array.from(getDemoMethodUsage()).sort();
    expect(usedMethods).toEqual([...DEMO_EXPECTED_METHODS].sort());
  });

  it('should show that advanced APIs are not implemented in this demo runtime flow', () => {
    const usedMethods = getDemoMethodUsage();
    const missingMethods = PUBLIC_AZURE_API_METHODS.filter(method => !usedMethods.has(method));

    expect(missingMethods).toEqual(
      expect.arrayContaining([
        'fromConnectionString',
        'createAdvancedIndex',
        'deleteIndex',
        'updateVector',
        'deleteVectors',
        'deleteVector',
        'advancedQuery',
        'semanticQuery',
        'hybridQuery',
        'multiVectorQuery',
        'exactQuery',
      ]),
    );
  });

  it('should keep query() calls free of Azure-only advanced options', () => {
    const content = getDemoContent();

    for (const advancedKey of QUERY_ONLY_ADVANCED_KEYS) {
      expect(content).not.toMatch(new RegExp(`query\\([\\s\\S]{0,400}${advancedKey}`));
    }
  });

  it('should document metadata filtering limitations in the README', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

    expect(readme).toContain('metadata is stored as a JSON string');
    expect(readme).toContain('not filterable by default');
    expect(readme).toContain('advancedQuery() is the path for Azure-specific features');
  });
});
