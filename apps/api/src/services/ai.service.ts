import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getMemoryContextPrompt } from './memory.service.js';
import {
  formatSearchContext,
  searchWebWithGoogle,
  shouldSearchWeb,
} from './search.service.js';
import { getGoogleContextForPrompt } from '../routes/googleDrive.js';

export type AIProvider = 'groq' | 'gemini' | 'copilot';

export class AIProviderError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'AIProviderError';
    this.statusCode = statusCode;
  }
}

export function getDefaultAIModel(provider: AIProvider): string {
  switch (provider) {
    case 'groq':
      return config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b';
    case 'gemini':
      return 'gemini-flash-lite-latest';
    case 'copilot':
      return 'gpt-4o-mini';
    default:
      return 'qwen/qwen3.8-27b';
  }
}

export interface AIModelInfo {
  id: string;
  name: string;
}

export async function listAIModels(provider: AIProvider): Promise<AIModelInfo[]> {
  if (provider === 'groq') {
    const defaultModel = config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b';
    return [
      { id: defaultModel, name: 'Qwen 3.8 27B (Ultra Fast)' },
      { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
      { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' },
      { id: 'allam-2-7b', name: 'Allam 2 7B' },
    ];
  }

  if (provider === 'gemini') {
    return [
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite (High Reliability)' },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ];
  }

  if (provider === 'copilot') {
    return [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (GitHub)' },
      { id: 'gpt-4o', name: 'GPT-4o (GitHub)' },
      { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
    ];
  }

  return [];
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function generateAIReply(
  prompt: string,
  history: Message[] = [],
  preferredProvider?: AIProvider,
  preferredModel?: string,
  signal?: AbortSignal
): Promise<{ reply: string; provider: string; model: string }> {
  const provider = preferredProvider || (config.DEFAULT_AI_PROVIDER as AIProvider) || 'groq';
  const [searchResults, googleContext] = await Promise.all([
    shouldSearchWeb(prompt) ? searchWebWithGoogle(prompt, 5, signal) : Promise.resolve([]),
    getGoogleContextForPrompt(prompt),
  ]);
  const systemPrompt =
    'You are Karen Ultra, a sharp, loyal, and friendly female personal AI assistant for your owner Hari Prasath. You communicate naturally in conversational Thanglish (Tamil in Latin script mixed with English) by default, while fully understanding Tamil and English. Provide concise, clear, and proactive assistance.' +
    getMemoryContextPrompt() +
    googleContext +
    formatSearchContext(searchResults);

  // 1. Groq Cloud (Qwen 3.8 27B) - Verified & Operational
  if (provider === 'groq' && config.GROQ_API_KEY) {
    try {
      const messages = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: prompt },
      ];

      const modelId = preferredModel || getDefaultAIModel('groq');

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature: 0.6,
          max_tokens: 1024,
        }),
        signal,
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content;
        if (reply) {
          return { reply: reply.trim(), provider: 'groq', model: modelId };
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        logger.warn('Groq error, falling back:', errJson);
      }
    } catch (err) {
      logger.warn('Groq call failed, trying fallback', { err });
    }
  }

  // 2. Google Gemini API (gemini-flash-lite-latest) - Verified & Operational
  if ((provider === 'gemini' || !preferredProvider) && config.GEMINI_API_KEY) {
    try {
      const modelName = preferredModel || getDefaultAIModel('gemini');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: systemPrompt,
              },
            ],
          },
          contents: [
            ...history.map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.content }],
            })),
            { role: 'user', parts: [{ text: prompt }] },
          ],
        }),
        signal,
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          return { reply: reply.trim(), provider: 'gemini', model: modelName };
        }
      }
    } catch (err) {
      logger.warn('Gemini provider call failed', { err });
    }
  }

  // 3. GitHub Models / Copilot (gpt-4o-mini)
  const ghToken = config.GITHUB_TOKEN || config.COPILOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if ((provider === 'copilot' || (!config.GROQ_API_KEY && !config.GEMINI_API_KEY)) && ghToken) {
    try {
      const model = preferredModel || 'gpt-4o-mini';
      const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ghToken}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: prompt },
          ],
        }),
        signal,
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content;
        if (reply) {
          return { reply: reply.trim(), provider: 'copilot', model };
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        logger.warn('GitHub Models call error:', errJson);
      }
    } catch (err) {
      logger.warn('GitHub Models call failed', { err });
    }
  }

  // 4. Default graceful Thanglish fallback
  return {
    reply: `Vanakkam Hari! Naan unga message-a accept panniten: "${prompt}". Ungaluku help panna naan ready!`,
    provider: 'local-karen',
    model: 'karen-core-v1',
  };
}
