import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { aiLimit } from '../middleware/rateLimit.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { AIProviderError, getDefaultAIModel, generateAIReply, listAIModels, } from '../services/ai.service.js';
import { voiceStatus, synthesizeFemaleVoice } from '../voice/policy.js';
import { hydrateGoogleTokensFromRequest } from './googleDrive.js';
import { appendChatMessage, createConversation, deleteConversation, getConversationMessages, listConversations, } from '../services/chatLibrary.service.js';
import { success, error } from '../utils/response.js';
import { config } from '../config/env.js';
import { detectLoveModeActivation, detectLoveModeDeactivation, getLoveModeState, setLoveModeActive, } from '../services/loveMode.service.js';
import { runCommandEngine } from '../commands/engine.js';
const router = Router();
const providerSchema = z.enum(['groq', 'gemini', 'copilot']);
const chatSchema = z.object({
    message: z.string().min(1).max(8000),
    history: z
        .array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(8000),
    }))
        .max(20)
        .optional(),
    provider: providerSchema.optional(),
    model: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._:/-]+$/).optional(),
    conversationId: z.string().uuid().optional(),
    clientMessageId: z.string().min(1).max(120).optional(),
    saveToLibrary: z.boolean().optional(),
    currentPage: z.string().max(120).optional(),
});
router.get('/ai/models', requireAuth, requireOwner, aiLimit, async (req, res) => {
    const parsedProvider = providerSchema.safeParse(req.query.provider);
    if (!parsedProvider.success) {
        return error(res, 'A valid AI provider is required.', 400);
    }
    const provider = parsedProvider.data;
    try {
        const models = await listAIModels(provider);
        return success(res, {
            provider,
            defaultModel: getDefaultAIModel(provider),
            models,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load AI models.';
        const status = err instanceof AIProviderError ? err.statusCode : 502;
        return error(res, message, status, 'AI_MODEL_LIST_ERROR');
    }
});
router.post('/ai/chat', requireAuth, requireOwner, aiLimit, validate(chatSchema), async (req, res) => {
    await hydrateGoogleTokensFromRequest(req);
    try {
        const ownerChatKey = config.TELEGRAM_OWNER_CHAT_ID || req.user?.id || 'owner';
        let promptText = req.body.message.replace(/^\[LOVE_MODE\]\s*/i, '');
        let isLoveMode = false;
        if (detectLoveModeDeactivation(promptText)) {
            await setLoveModeActive(ownerChatKey, false);
        }
        else {
            const loveState = await getLoveModeState(ownerChatKey);
            const shouldActivate = !loveState.active && detectLoveModeActivation(promptText);
            if (shouldActivate) {
                await setLoveModeActive(ownerChatKey, true);
            }
            if (loveState.active || shouldActivate) {
                isLoveMode = true;
            }
        }
        const engineRes = isLoveMode
            ? null
            : await runCommandEngine({
                chatKey: req.body.conversationId || ownerChatKey,
                text: promptText,
                userId: req.user?.id,
                channel: 'web',
                history: req.body.history,
            });
        const result = engineRes?.handled
            ? {
                reply: engineRes.reply,
                provider: 'karen-command-engine',
                model: 'command-router-v1',
                buttons: engineRes.buttons,
                outcome: engineRes.outcome,
            }
            : await generateAIReply(promptText, req.body.history, req.body.provider, req.body.model, undefined, {
                loveMode: isLoveMode,
                currentPage: req.body.currentPage,
                userId: req.user?.id,
            });
        let conversationId = req.body.conversationId;
        if (req.body.saveToLibrary !== false) {
            if (!conversationId) {
                const created = await createConversation(req.body.message.slice(0, 60), 'web', req.user?.id);
                conversationId = created.id;
            }
            const clientMsgId = typeof req.body.clientMessageId === 'string' ? req.body.clientMessageId : undefined;
            await appendChatMessage(conversationId, 'user', req.body.message, { channel: 'web', clientMessageId: clientMsgId }, req.user?.id);
            await appendChatMessage(conversationId, 'assistant', result.reply, {
                channel: 'web',
                provider: result.provider,
                model: result.model,
                clientMessageId: clientMsgId ? `${clientMsgId}-assistant` : undefined,
            }, req.user?.id);
        }
        return success(res, { ...result, conversationId });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'AI generation failed';
        const status = err instanceof AIProviderError ? err.statusCode : 502;
        return error(res, message, status, 'AI_PROVIDER_ERROR');
    }
});
// ─── Chat Library (Database-persisted conversations) ──────────────────────────
router.get('/ai/conversations', requireAuth, requireOwner, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const conversations = await listConversations(req.user?.id, undefined, { q, limit, offset });
    return success(res, conversations);
});
router.post('/ai/conversations', requireAuth, requireOwner, async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title : 'New Chat';
    const created = await createConversation(title, 'web', req.user?.id);
    return success(res, created, 201);
});
router.get('/ai/conversations/:id/messages', requireAuth, requireOwner, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const messages = await getConversationMessages(String(req.params.id), req.user?.id, { limit, before });
    return success(res, messages);
});
router.post('/ai/conversations/:id/messages', requireAuth, requireOwner, async (req, res) => {
    const bodySchema = z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1).max(8000),
        channel: z.string().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        clientMessageId: z.string().min(1).max(120).optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'Invalid message payload', 400);
    }
    const saved = await appendChatMessage(String(req.params.id), parsed.data.role, parsed.data.content, {
        channel: parsed.data.channel || 'web',
        provider: parsed.data.provider,
        model: parsed.data.model,
        clientMessageId: parsed.data.clientMessageId,
    }, req.user?.id);
    return success(res, saved, 201);
});
router.delete('/ai/conversations/:id', requireAuth, requireOwner, async (req, res) => {
    const deleted = await deleteConversation(String(req.params.id), req.user?.id);
    if (!deleted) {
        return error(res, 'Conversation not found', 404);
    }
    return success(res, { deleted: true });
});
router.get('/voice/status', requireAuth, requireOwner, (_req, res) => {
    return success(res, voiceStatus());
});
router.post('/voice/synthesize', requireAuth, requireOwner, aiLimit, async (req, res) => {
    const text = z.string().min(1).max(4000).safeParse(req.body?.text);
    if (!text.success) {
        return error(res, 'Text must be between 1 and 4000 characters.', 400);
    }
    const status = voiceStatus();
    if (!status.ready) {
        return error(res, 'Female voice is not configured and verified. No alternate or male voice will be used.', 503);
    }
    try {
        const audio = await synthesizeFemaleVoice(text.data);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(audio);
    }
    catch (err) {
        return error(res, err.message || 'Voice provider unavailable', 502);
    }
});
export default router;
