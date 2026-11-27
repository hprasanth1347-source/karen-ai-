import { z } from 'zod';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { generateAIReply, getDefaultAIModel, type AIProvider } from './ai.service.js';
import { cacheService } from './cache.service.js';

export type AIResult = Awaited<ReturnType<typeof generateAIReply>>;

export interface ProviderHealth {
  provider: AIProvider;
  configured: boolean;
  healthy: boolean;
  defaultModel: string;
}

class AIProviderManager {
  public async generateText(input: {
    prompt: string;
    history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    provider?: AIProvider;
    model?: string;
    userId?: string;
    loveMode?: boolean;
    currentPage?: string;
    timeoutMs?: number;
  }): Promise<AIResult> {
    const primary = input.provider || config.DEFAULT_AI_PROVIDER || 'groq';
    const signal = AbortSignal.timeout(input.timeoutMs ?? 20000);
    const started = Date.now();
    try {
      const res = await generateAIReply(
        input.prompt,
        input.history || [],
        primary,
        input.model,
        signal,
        {
          loveMode: input.loveMode,
          currentPage: input.currentPage,
          userId: input.userId,
        }
      );
      logger.info('AI generation succeeded', {
        provider: res.provider,
        model: res.model,
        durationMs: Date.now() - started,
      });
      return res;
    } catch (err) {
      const fallback: AIProvider = primary === 'groq' ? 'gemini' : 'groq';
      logger.warn('Primary AI provider failed, attempting bounded fallback', {
        primary,
        fallback,
        err: err instanceof Error ? err.message : String(err),
      });
      return generateAIReply(
        input.prompt,
        input.history || [],
        fallback,
        undefined,
        AbortSignal.timeout(15000),
        {
          loveMode: input.loveMode,
          currentPage: input.currentPage,
          userId: input.userId,
        }
      );
    }
  }

  public async generateStructuredOutput<T>(
    input: {
      prompt: string;
      provider?: AIProvider;
      model?: string;
      userId?: string;
    },
    schema: z.ZodType<T>
  ): Promise<T> {
    const strictPrompt = `${input.prompt}\n\nRespond ONLY with valid JSON matching the required schema. Do not wrap in markdown fences.`;
    const first = await this.generateText({ ...input, prompt: strictPrompt });
    const cleanJson = (raw: string) =>
      raw
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();

    try {
      return schema.parse(JSON.parse(cleanJson(first.reply)));
    } catch (parseErr) {
      // One bounded repair attempt
      const repairPrompt = `Fix this JSON so it is valid and matches the schema. Error: ${
        parseErr instanceof Error ? parseErr.message : 'Invalid JSON'
      }\nOriginal:\n${first.reply}`;
      const repaired = await this.generateText({ ...input, prompt: repairPrompt });
      return schema.parse(JSON.parse(cleanJson(repaired.reply)));
    }
  }

  public async classifyIntent<T extends string>(
    text: string,
    intents: readonly T[],
    provider?: AIProvider
  ): Promise<{ intent: T; confidence: number }> {
    const schema = z.object({
      intent: z.string(),
      confidence: z.number().min(0).max(1),
    });
    const prompt = `Classify the user message into one of these intents: ${intents.join(', ')}.\nMessage: "${text.slice(0, 500)}"\nReturn JSON {"intent": "...", "confidence": 0.9}.`;
    try {
      const out = await this.generateStructuredOutput({ prompt, provider }, schema);
      const matched = intents.find((i) => i.toLowerCase() === out.intent.toLowerCase()) || intents[intents.length - 1];
      return { intent: matched, confidence: out.confidence };
    } catch {
      return { intent: intents[intents.length - 1], confidence: 0.3 };
    }
  }

  public async health(): Promise<ProviderHealth[]> {
    const key = cacheService.buildKey('ai', 'system', 'provider-health');
    return cacheService.getOrSet(
      key,
      async () => [
        {
          provider: 'groq',
          configured: Boolean(config.GROQ_API_KEY),
          healthy: Boolean(config.GROQ_API_KEY),
          defaultModel: getDefaultAIModel('groq'),
        },
        {
          provider: 'gemini',
          configured: Boolean(config.GEMINI_API_KEY),
          healthy: Boolean(config.GEMINI_API_KEY),
          defaultModel: getDefaultAIModel('gemini'),
        },
        {
          provider: 'copilot',
          configured: Boolean(config.COPILOT_GITHUB_TOKEN || config.GITHUB_TOKEN),
          healthy: Boolean(config.COPILOT_GITHUB_TOKEN || config.GITHUB_TOKEN),
          defaultModel: getDefaultAIModel('copilot'),
        },
      ],
      { ttlSeconds: 30, tags: ['ai-health'] }
    );
  }
}

export const aiProviderManager = new AIProviderManager();
