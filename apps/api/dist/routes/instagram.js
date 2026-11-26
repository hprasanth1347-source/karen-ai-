import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { success, error } from '../utils/response.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getInstagramProfile, getInstagramMedia, getInstagramConversations, getThreadDetails, sendInstagramMessage, draftInstagramReply, executeInstagramVoiceCommand, } from '../providers/instagram.js';
import { instagramAutoReplyService } from '../services/instagramAutoReply.js';
import { getActiveStories, getAllReels, getFollowerMonitorSummary, getFollowersAndFollowing, getInstagramConnectionHealth, getInstagramNotesActivity, handleInstagramCommentEvent, handleInstagramMentionEvent, handleInstagramNoteActivityEvent, } from '../services/instagramHub.service.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { clearInstagramTokensFromDb, loadInstagramTokensWithStatus, loadUserSetting, saveInstagramTokensToDb, saveUserSetting, } from '../services/persistence.service.js';
const router = Router();
router.use((req, res, next) => {
    if (req.path === '/webhook') {
        return next();
    }
    return requireAuth(req, res, () => requireOwner(req, res, next));
});
// In-memory store for VIP contacts
let vipContacts = ['_.raghul._.15', 'tech_colleague', 'founder_friend'];
// 1. Live Profile
router.get('/profile', async (_req, res) => {
    try {
        const profile = await getInstagramProfile();
        return success(res, profile);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 2. Live Media & Posts / Reels
router.get('/media', async (_req, res) => {
    try {
        const media = await getInstagramMedia();
        return success(res, media);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 3. Live Conversations (threads)
router.get('/conversations', async (_req, res) => {
    try {
        const conversations = await getInstagramConversations();
        return success(res, conversations);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 4. Thread details
router.get('/conversations/:id', async (req, res) => {
    try {
        const messages = await getThreadDetails(req.params.id);
        return success(res, messages);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 5. Draft AI Reply in Thanglish
const draftSchema = z.object({
    message: z.string().min(1),
    username: z.string().optional(),
});
router.post('/draft', validate(draftSchema), async (req, res) => {
    try {
        const draft = await draftInstagramReply(req.body.message, req.body.username);
        return success(res, { draft });
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 6. Send message with owner approval
const sendSchema = z.object({
    recipientId: z.string().min(1),
    message: z.string().min(1),
});
router.post('/send', validate(sendSchema), async (req, res) => {
    try {
        const result = await sendInstagramMessage(req.body.recipientId, req.body.message);
        if (!result.success) {
            return error(res, result.error || 'Failed to send Instagram message', 400);
        }
        return success(res, result);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 6b. Full Instagram Voice Command Handler
const voiceCommandSchema = z.object({
    command: z.string().min(1),
    provider: z.enum(['groq', 'gemini', 'copilot']).optional(),
    model: z.string().optional(),
});
router.post('/voice-command', validate(voiceCommandSchema), async (req, res) => {
    try {
        const { command, provider, model } = req.body;
        const result = await executeInstagramVoiceCommand(command, provider, model);
        return success(res, result);
    }
    catch (err) {
        logger.error('Voice command error:', err);
        return error(res, err.message || 'Voice command failed', 500);
    }
});
// 7. VIP / Favourite contacts & server-persisted UI state
router.get('/status', async (req, res) => {
    const { tokens, status } = await loadInstagramTokensWithStatus(req.user?.id);
    return success(res, {
        connected: status === 'connected',
        status,
        accountId: tokens?.accountId || config.INSTAGRAM_ACCOUNT_ID || null,
        expiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
    });
});
router.post('/connect', validate(z.object({
    accessToken: z.string().min(10),
    accountId: z.string().optional(),
    pageId: z.string().optional(),
    expiresInDays: z.number().min(1).max(365).optional(),
})), async (req, res) => {
    const expiresAt = Date.now() + (req.body.expiresInDays ?? 60) * 24 * 60 * 60 * 1000;
    await saveInstagramTokensToDb({
        accessToken: req.body.accessToken,
        accountId: req.body.accountId || config.INSTAGRAM_ACCOUNT_ID || '',
        pageId: req.body.pageId || config.INSTAGRAM_PAGE_ID || '',
        expiresAt,
    }, req.user?.id);
    return success(res, { connected: true, status: 'connected', expiresAt: new Date(expiresAt).toISOString() });
});
router.post('/disconnect', async (req, res) => {
    await clearInstagramTokensFromDb(req.user?.id);
    return success(res, { disconnected: true, status: 'disconnected' });
});
router.get('/ui-state', async (_req, res) => {
    const saved = await loadUserSetting('instagram_ui_state');
    return success(res, {
        lastTab: saved?.lastTab || 'inbox',
        vipContacts: Array.isArray(saved?.vipContacts) ? saved.vipContacts : vipContacts,
    });
});
router.put('/ui-state', async (req, res) => {
    const prev = await loadUserSetting('instagram_ui_state');
    const next = {
        lastTab: typeof req.body?.lastTab === 'string' ? req.body.lastTab : prev?.lastTab || 'inbox',
        vipContacts: Array.isArray(req.body?.vipContacts) ? req.body.vipContacts : prev?.vipContacts || vipContacts,
    };
    await saveUserSetting('instagram_ui_state', next);
    return success(res, next);
});
router.get('/favourites', async (_req, res) => {
    const saved = await loadUserSetting('instagram_ui_state');
    return success(res, Array.isArray(saved?.vipContacts) ? saved.vipContacts : vipContacts);
});
router.post('/favourites', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const saved = await loadUserSetting('instagram_ui_state');
    const current = Array.isArray(saved?.vipContacts) ? saved.vipContacts : [...vipContacts];
    if (username && !current.includes(username)) {
        current.push(username);
        await saveUserSetting('instagram_ui_state', { ...saved, vipContacts: current });
    }
    return success(res, current);
});
// 8. Creator account insights
router.get('/insights', async (_req, res) => {
    return success(res, {
        account_type: 'CREATOR',
        username: config.INSTAGRAM_USERNAME || null,
        total_followers: 1420,
        reach_last_30d: 8450,
        impressions_last_30d: 14200,
        connected: Boolean(config.INSTAGRAM_ACCESS_TOKEN),
        token_status: 'ACTIVE_SYSTEM_TOKEN',
        permissions: [
            { name: 'instagram_basic', status: 'GRANTED' },
            { name: 'instagram_manage_messages', status: 'GRANTED' },
            { name: 'pages_messaging', status: 'GRANTED' },
        ],
    });
});
// 9. Meta Webhook Verification
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN) {
        logger.info('Meta webhook verified successfully');
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});
// 10. Meta Webhook Events & Real-Time Auto-Reply Dispatcher
router.post('/webhook', async (req, res) => {
    const signature = req.header('x-hub-signature-256');
    const appSecret = config.META_APP_SECRET;
    const rawBody = req.rawBody;
    if (!appSecret || !signature || !rawBody) {
        return res.sendStatus(401);
    }
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return res.sendStatus(401);
    }
    logger.info('Received and authenticated Instagram Webhook Event');
    const body = req.body;
    // Process webhook messages before acknowledging so serverless runtimes can finish the work.
    if (body.object === 'instagram' && Array.isArray(body.entry)) {
        for (const entry of body.entry) {
            if (Array.isArray(entry.messaging)) {
                for (const event of entry.messaging) {
                    if (event.message && event.sender?.id && !event.message.is_echo) {
                        const senderId = event.sender.id;
                        const messageId = event.message.mid || `mid_${Date.now()}`;
                        const messageText = event.message.text || '';
                        const senderUsername = event.sender.username || 'friend';
                        logger.info(`Instagram webhook received message for sender ${senderId}`);
                        try {
                            if (event.message.reply_to?.note) {
                                await handleInstagramNoteActivityEvent({
                                    eventKey: `note_reply:${messageId}`,
                                    activityType: 'note_reply',
                                    noteId: event.message.reply_to.note.id,
                                    noteText: event.message.reply_to.note.text,
                                    actorId: senderId,
                                    actorUsername: senderUsername,
                                    replyText: messageText,
                                });
                            }
                            await instagramAutoReplyService.handleIncomingMessage(senderId, senderUsername, messageId, messageText, false, {
                                attachments: event.message.attachments,
                                replyToStoryId: event.message.reply_to?.story?.id,
                            });
                        }
                        catch (err) {
                            logger.error('Error handling webhook auto-reply:', err);
                        }
                    }
                }
            }
            if (Array.isArray(entry.changes)) {
                for (const change of entry.changes) {
                    if (change.field === 'comments' && change.value?.id) {
                        await handleInstagramCommentEvent({
                            commentId: String(change.value.id),
                            mediaId: String(change.value.media?.id || ''),
                            username: String(change.value.from?.username || 'user'),
                            text: String(change.value.text || ''),
                        }).catch(() => { });
                    }
                    else if (change.field === 'mentions' && (change.value?.media_id || change.value?.comment_id)) {
                        await handleInstagramMentionEvent({
                            id: String(change.value.comment_id || change.value.media_id),
                            mediaId: change.value.media_id ? String(change.value.media_id) : undefined,
                            creatorUsername: String(change.value.username || 'creator'),
                            permalink: change.value.permalink,
                            caption: change.value.caption,
                        }).catch(() => { });
                    }
                }
            }
        }
    }
    return res.status(200).send('EVENT_RECEIVED');
});
// 11. Auto-Reply Configuration & Audit Endpoints
router.get('/auto-reply', async (_req, res) => {
    const [cfg, logs] = await Promise.all([
        instagramAutoReplyService.getConfig(),
        instagramAutoReplyService.getLogs(),
    ]);
    return success(res, { config: cfg, logs });
});
const autoReplyConfigSchema = z.object({
    enabled: z.boolean().optional(),
    triggerMode: z.enum(['all', 'contains_hi']).optional(),
    customTemplate: z.string().max(500).optional(),
    customInstructions: z.string().max(1500).optional(),
    aiProvider: z.enum(['groq', 'gemini', 'copilot']).optional(),
    aiModel: z.string().optional(),
});
router.post('/auto-reply/config', validate(autoReplyConfigSchema), async (req, res) => {
    const updated = await instagramAutoReplyService.updateConfig(req.body);
    return success(res, updated);
});
router.post('/auto-reply/toggle', async (_req, res) => {
    const current = await instagramAutoReplyService.getConfig();
    const updated = await instagramAutoReplyService.updateConfig({ enabled: !current.enabled });
    return success(res, updated);
});
router.post('/auto-reply/poll', async (_req, res) => {
    try {
        const repliesSent = await instagramAutoReplyService.scanAndAutoReply();
        return success(res, {
            message: `Scanned active Instagram conversations. ${repliesSent} auto-reply messages dispatched.`,
            repliesSent,
            logs: await instagramAutoReplyService.getLogs(),
        });
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 12. Simulate Incoming Message (Test auto-reply live)
const simulateSchema = z.object({
    message: z.string().min(1),
    senderUsername: z.string().optional(),
    senderId: z.string().optional(),
});
router.post('/auto-reply/simulate', validate(simulateSchema), async (req, res) => {
    try {
        const senderId = req.body.senderId || '1681852029959817'; // Defaults to Raghul
        const senderUsername = req.body.senderUsername || '_.raghul._.15';
        const messageId = `sim_${Date.now()}`;
        const messageText = req.body.message;
        const result = await instagramAutoReplyService.handleIncomingMessage(senderId, senderUsername, messageId, messageText, true);
        return success(res, {
            simulated: true,
            sender: { id: senderId, username: senderUsername },
            incomingMessage: messageText,
            autoReplied: result.autoReplied,
            replyText: result.replyText,
            logs: await instagramAutoReplyService.getLogs(),
        });
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 13. Retry Failed Auto-Reply Dispatch
router.post('/auto-reply/retry', async (req, res) => {
    try {
        const { senderId, replyText, senderUsername } = req.body;
        if (!senderId || !replyText) {
            return error(res, 'senderId and replyText are required', 400);
        }
        const sendRes = await sendInstagramMessage(senderId, replyText);
        if (!sendRes.success) {
            return error(res, sendRes.error || 'Meta dispatch failed', 400);
        }
        return success(res, {
            success: true,
            sender: senderUsername,
            metaMessageId: sendRes.messageId,
            message: `Successfully dispatched to @${senderUsername || senderId}!`,
        });
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
router.get('/health', async (req, res) => {
    const health = await getInstagramConnectionHealth(req.user?.id);
    return success(res, health);
});
router.get('/reels', async (req, res) => {
    const source = (typeof req.query.source === 'string' ? req.query.source : 'all');
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const data = await getAllReels({ source, search, userId: req.user?.id });
    return success(res, data);
});
router.get('/stories', async (req, res) => {
    const stories = await getActiveStories(req.user?.id);
    return success(res, stories);
});
router.get('/monitor', async (req, res) => {
    const monitor = await getFollowerMonitorSummary(req.user?.id);
    return success(res, monitor);
});
router.get('/followers', async (req, res) => {
    const data = await getFollowersAndFollowing(req.user?.id);
    return success(res, data);
});
router.get('/notes-activity', async (_req, res) => {
    const notes = await getInstagramNotesActivity();
    return success(res, notes);
});
router.post('/conversations/:id/takeover', async (req, res) => {
    const active = Boolean(req.body?.active ?? true);
    instagramAutoReplyService.setHumanTakeover(String(req.params.id), active);
    return success(res, { conversationId: req.params.id, humanTakeover: active });
});
export default router;
