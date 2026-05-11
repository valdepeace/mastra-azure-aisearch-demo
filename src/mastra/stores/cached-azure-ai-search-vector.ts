import { AzureAISearchVector } from '@mastra/azure-ai-search';
import type {
  AzureAISearchCreateIndexParams,
  AzureAISearchVectorOptions,
} from '@mastra/azure-ai-search';
import type { CreateIndexParams } from '@mastra/core/vector';

const isRateLimitError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('too many requests') || message.includes('rate limit') || message.includes('429');
};

export class CachedAzureAISearchVector extends AzureAISearchVector {
  private readonly ensuredIndexes = new Set<string>();
  private readonly inFlightEnsures = new Map<string, Promise<void>>();

  constructor(options: AzureAISearchVectorOptions & { id: string }) {
    super(options);
  }

  override async createIndex(params: CreateIndexParams | AzureAISearchCreateIndexParams): Promise<void> {
    const key = `${params.indexName}:${params.dimension}:${params.metric ?? 'cosine'}`;

    if (this.ensuredIndexes.has(key)) {
      return;
    }

    const inFlight = this.inFlightEnsures.get(key);
    if (inFlight) {
      return inFlight;
    }

    const ensure = this.ensureIndex(params, key).finally(() => {
      this.inFlightEnsures.delete(key);
    });

    this.inFlightEnsures.set(key, ensure);
    return ensure;
  }

  private async ensureIndex(
    params: CreateIndexParams | AzureAISearchCreateIndexParams,
    key: string,
  ): Promise<void> {
    try {
      await super.createIndex(params);
      this.ensuredIndexes.add(key);
      return;
    } catch (error) {
      if (!isRateLimitError(error)) {
        throw error;
      }

      const stats = await super.describeIndex({ indexName: params.indexName });
      if (stats.dimension !== params.dimension) {
        throw error;
      }

      this.ensuredIndexes.add(key);
    }
  }
}
