import { Mastra } from '@mastra/core';
import { InMemoryStore, MastraCompositeStore } from '@mastra/core/storage';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { knowledgeAgent } from './agents/knowledge-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { knowledgeMemoryAgent } from './agents/knowledge-memory-agent';

const persistentStorage = new LibSQLStore({
  id: 'main-libsql-storage',
  url: 'file:./mastra.db',
});

const observabilityStorage = new InMemoryStore({
  id: 'observability-storage',
});

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { 
    weatherAgent,
    knowledgeAgent,
    knowledgeMemoryAgent,
  },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new MastraCompositeStore({
    id: 'main-storage',
    default: persistentStorage,
    domains: {
      observability: observabilityStorage.stores.observability,
    },
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  bundler: {
    externals: false,
  },
});
