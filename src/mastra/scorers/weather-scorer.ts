import { z } from 'zod';
import { createScorer } from '@mastra/core/evals';

export const toolCallAppropriatenessScorer = createScorer({
  id: 'tool-call-appropriateness',
  name: 'Tool Call Appropriateness',
  description: 'Checks that the weatherTool was called when a weather query was made',
  type: 'agent',
  judge: {
    model: 'openai/gpt-4o-mini',
    instructions:
      'You are evaluating whether the assistant correctly called the weatherTool when a weather query was made. ' +
      'Return structured JSON with your assessment.',
  },
})
  .preprocess(({ run }) => {
    const userText = (run.input?.inputMessages?.[0]?.content as string) || '';
    const toolCalls: string[] = [];
    for (const step of run.steps ?? []) {
      if (step.toolCalls) {
        for (const tc of step.toolCalls) {
          toolCalls.push(tc.toolName ?? tc.name ?? '');
        }
      }
    }
    return { userText, toolCalls };
  })
  .analyze({
    description: 'Determine if weatherTool was appropriately called',
    outputSchema: z.object({
      isWeatherQuery: z.boolean(),
      weatherToolCalled: z.boolean(),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
User text: """${results.preprocessStepResult.userText}"""
Tool calls made: ${JSON.stringify(results.preprocessStepResult.toolCalls)}

Determine:
1) Was this a weather-related query?
2) Was "weatherTool" called?

Return JSON: { "isWeatherQuery": boolean, "weatherToolCalled": boolean, "explanation": string }
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    if (!r.isWeatherQuery) return 1;
    return r.weatherToolCalled ? 1 : 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `isWeatherQuery=${r.isWeatherQuery}, weatherToolCalled=${r.weatherToolCalled}. Score=${score}. ${r.explanation ?? ''}`;
  });

export const completenessScorer = createScorer({
  id: 'completeness',
  name: 'Completeness',
  description: 'Checks that the weather response covers all requested information',
  type: 'agent',
  judge: {
    model: 'openai/gpt-4o-mini',
    instructions: 'You are evaluating the completeness of a weather assistant response.',
  },
})
  .preprocess(({ run }) => ({
    userText: (run.input?.inputMessages?.[0]?.content as string) || '',
    assistantText: (run.output?.[0]?.content as string) || '',
  }))
  .analyze({
    description: 'Rate how completely the assistant answered the weather query',
    outputSchema: z.object({
      score: z.number().min(0).max(1),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
User: """${results.preprocessStepResult.userText}"""
Assistant: """${results.preprocessStepResult.assistantText}"""

Rate completeness 0-1: did the assistant answer all aspects of the weather query?
Return JSON: { "score": number, "explanation": string }
    `,
  })
  .generateScore(({ results }) => {
    return (results as any)?.analyzeStepResult?.score ?? 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `Completeness score=${score}. ${r.explanation ?? ''}`;
  });

export const translationScorer = createScorer({
  id: 'translation-quality',
  name: 'Translation Quality',
  description: 'Checks that non-English location names are translated and used correctly',
  type: 'agent',
  judge: {
    model: 'openai/gpt-4o-mini',
    instructions:
      'You are an expert evaluator of translation quality for geographic locations. ' +
      'Determine whether the user text mentions a non-English location and whether the assistant correctly uses an English translation of that location. ' +
      'Be lenient with transliteration differences and diacritics.',
  },
})
  .preprocess(({ run }) => ({
    userText: (run.input?.inputMessages?.[0]?.content as string) || '',
    assistantText: (run.output?.[0]?.content as string) || '',
  }))
  .analyze({
    description: 'Extract location names and detect language/translation adequacy',
    outputSchema: z.object({
      nonEnglish: z.boolean(),
      translated: z.boolean(),
      confidence: z.number().min(0).max(1).default(1),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
User text: """${results.preprocessStepResult.userText}"""
Assistant response: """${results.preprocessStepResult.assistantText}"""

1) Is the location non-English?
2) If non-English, did the assistant use a correct English translation?

Return JSON: { "nonEnglish": boolean, "translated": boolean, "confidence": number, "explanation": string }
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    if (!r.nonEnglish) return 1;
    if (r.translated) return Math.max(0, Math.min(1, 0.7 + 0.3 * (r.confidence ?? 1)));
    return 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `nonEnglish=${r.nonEnglish ?? false}, translated=${r.translated ?? false}, confidence=${r.confidence ?? 0}. Score=${score}. ${r.explanation ?? ''}`;
  });

export const scorers = {
  toolCallAppropriatenessScorer,
  completenessScorer,
  translationScorer,
};
