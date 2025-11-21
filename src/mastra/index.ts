
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { knowledgeAgent } from './agents/knowledge-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { knowledgeMemoryAgent } from './agents/knowledge-memory-agent';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { 
    weatherAgent,
    knowledgeAgent,
    knowledgeMemoryAgent,
  },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new LibSQLStore({
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    // url: ":memory:",
    url: 'file:./mastra.db'
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: true, 
  },
 observability: {
    default: {
      enabled: true,
      // opcional: nivel de detalle
      // logPrompts: true,      // para ver prompts a modelos
      // logTools: true,        // para ver llamadas a tools
      // logMemory: true,       // para ver semantic recall, etc.
    },
  },
  
});
