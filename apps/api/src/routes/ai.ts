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
import { hydrateGoogleTokensFromRequest } from './googleDrive.js';
import {
  appendChatMessage,
  createConversation,
  deleteConversation,
  getConversationMessages,
  listConversations,
} from '../services/chatLibrary.service.js';
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
  conversationId: z.string().uuid().optional(),
  saveToLibrary: z.boolean().optional(),
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
  await hydrateGoogleTokensFromRequest(req);
  try {
    const result = await generateAIReply(
      req.body.message,
      req.body.history,
      req.body.provider,
      req.body.model
    );

    let conversationId: string | undefined = req.body.conversationId;
    if (req.body.saveToLibrary !== false) {
      if (!conversationId) {
        const created = await createConversation(req.body.message.slice(0, 60), 'web', req.user?.id);
        conversationId = created.id;
      }
      await appendChatMessage(conversationId, 'user', req.body.message, { channel: 'web' }, req.user?.id);
      await appendChatMessage(
        conversationId,
        'assistant',
        result.reply,
        { channel: 'web', provider: result.provider, model: result.model },
        req.user?.id
      );
    }

    return success(res, { ...result, conversationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed';
    const status = err instanceof AIProviderError ? err.statusCode : 502;
    return error(res, message, status, 'AI_PROVIDER_ERROR');
  }
});

// ─── Chat Library (Database-persisted conversations) ──────────────────────────

router.get('/ai/conversations', async (req, res) => {
  const conversations = await listConversations(req.user?.id);
  return success(res, conversations);
});

router.post('/ai/conversations', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : 'New Chat';
  const created = await createConversation(title, 'web', req.user?.id);
  return success(res, created, 201);
});

router.get('/ai/conversations/:id/messages', async (req, res) => {
  const messages = await getConversationMessages(String(req.params.id), req.user?.id);
  return success(res, messages);
});

router.delete('/ai/conversations/:id', async (req, res) => {
  const deleted = await deleteConversation(String(req.params.id), req.user?.id);
  if (!deleted) {
    return error(res, 'Conversation not found', 404);
  }
  return success(res, { deleted: true });
});

router.get('/voice/status', (_req, res) => {
  return success(res, voiceStatus());
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
