import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { aiLimit } from '../middleware/rateLimit.js';
import {
  AIProviderError,
  getDefaultAIModel,
  generateAIReply,
  listAIModels,
  type AIProvider,
} from '../services/ai.service.js';
import { voiceStatus, synthesizeFemaleVoice } from '../voice/policy.js';
import { success, error } from '../utils/response.js';

const router = Router();
const providerSchema = z.enum(['groq', 'gemini', 'copilot']);

const chatSchema = z.object({
  message: z.string().min(1).max(8000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
  provider: providerSchema.optional(),
  model: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._:/-]+$/).optional(),
});

router.get('/ai/models', aiLimit, async (req, res) => {
  const parsedProvider = providerSchema.safeParse(req.query.provider);
  if (!parsedProvider.success) {
    return error(res, 'A valid AI provider is required.', 400);
  }

  const provider: AIProvider = parsedProvider.data;
  try {
    const models = await listAIModels(provider);
    return success(res, {
      provider,
      defaultModel: getDefaultAIModel(provider),
      models,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load AI models.';
    const status = err instanceof AIProviderError ? err.statusCode : 502;
    return error(res, message, status, 'AI_MODEL_LIST_ERROR');
  }
});

router.post('/ai/chat', aiLimit, validate(chatSchema), async (req, res) => {
  try {
    const result = await generateAIReply(
      req.body.message,
      req.body.history,
      req.body.provider,
      req.body.model
    );
    return success(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed';
    const status = err instanceof AIProviderError ? err.statusCode : 502;
    return error(res, message, status, 'AI_PROVIDER_ERROR');
  }
});

router.post('/voice/synthesize', async (req, res) => {
  const text = z.string().min(1).max(4000).safeParse(req.body?.text);
  if (!text.success) {
    return error(res, 'Text must be between 1 and 4000 characters.', 400);
  }

  const status = voiceStatus();
  if (!status.ready) {
    return error(
      res,
      'Female voice is not configured and verified. No alternate or male voice will be used.',
      503
    );
  }

  try {
    const audio = await synthesizeFemaleVoice(text.data);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audio);
  } catch (err: any) {
    return error(res, err.message || 'Voice provider unavailable', 502);
  }
});

export default router;
