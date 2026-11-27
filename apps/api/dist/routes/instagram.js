import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { success, error } from '../utils/response.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getInstagramProfile, getInstagramMedia, getInstagramConversations, getThreadDetails, sendInstagramMessage, draftInstagramReply, executeInstagramVoiceCommand, lookupInstagramUserById, invalidateInstagramCache, } from '../providers/instagram.js';
import { instagramAutoReplyService } from '../services/instagramAutoReply.js';
import { getActiveStories, getAllReels, getFollowerMonitorSummary, getFollowersAndFollowing, getInstagramConnectionHealth, getInstagramNotesActivity, handleInstagramCommentEvent, handleInstagramMentionEvent, handleInstagramNoteActivityEvent, publishInstagramContent, getAccountInsights, getMediaComments, replyToInstagramComment, getAdsSummary, } from '../services/instagramHub.service.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { clearInstagramTokensFromDb, loadInstagramTokensWithStatus, loadUserSetting, saveInstagramTokensToDb, saveUserSetting, } from '../services/persistence.service.js';
const router = Router();
router.use((req, res, next) => {
    if (req.path === '/webhook') {
        return next();
    }
    return requireAuth(req, res, () => requireOwner(req, res, next));
});
// Default empty VIP list unless persisted in user_settings
const vipContacts = [];
// 1. Live Profile
router.get('/profile', async (req, res) => {
    try {
        const profile = await getInstagramProfile(req.user?.id);
        return success(res, profile);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 2. Live Media & Posts / Reels
router.get('/media', async (req, res) => {
    try {
        const media = await getInstagramMedia(req.user?.id);
        return success(res, media);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 3. Live Conversations (threads)
router.get('/conversations', async (req, res) => {
    try {
        const forceFresh = req.query.fresh === '1' || req.query.fresh === 'true';
        const conversations = await getInstagramConversations({ forceFresh, userId: req.user?.id });
        return success(res, conversations);
    }
    catch (err) {
        return error(res, err.message, 400, 'INSTAGRAM_SYNC_ERROR');
    }
});
// 4. Thread details
router.get('/conversations/:id', async (req, res) => {
    try {
        const messages = await getThreadDetails(req.params.id, req.user?.id);
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
    preferredProvider: z.enum(['groq', 'gemini', 'copilot']).optional(),
    preferredModel: z.string().optional(),
});
router.post('/draft', validate(draftSchema), async (req, res) => {
    try {
        const draft = await draftInstagramReply(req.body.message, req.body.username, req.body.preferredProvider, req.body.preferredModel);
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
        const result = await sendInstagramMessage(req.body.recipientId, req.body.message, req.user?.id);
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
        accessToken: req.body.accessToken.trim(),
        accountId: (req.body.accountId || config.INSTAGRAM_ACCOUNT_ID || '').trim(),
        pageId: (req.body.pageId || config.INSTAGRAM_PAGE_ID || '').trim(),
        expiresAt,
    }, req.user?.id);
    invalidateInstagramCache();
    return success(res, { connected: true, status: 'connected', expiresAt: new Date(expiresAt).toISOString() });
});
router.post('/disconnect', async (req, res) => {
    await clearInstagramTokensFromDb(req.user?.id);
    invalidateInstagramCache();
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
// 8. Creator account insights & 8 Permitted Skills
router.get('/insights', async (req, res) => {
    try {
        const [profile, tokenState, health] = await Promise.all([
            getInstagramProfile(req.user?.id),
            loadInstagramTokensWithStatus(req.user?.id),
            getInstagramConnectionHealth(req.user?.id).catch(() => null),
        ]);
        const hasToken = tokenState.status === 'connected' || Boolean(config.INSTAGRAM_ACCESS_TOKEN);
        const grantedPerms = new Set(health?.permissions || []);
        const meta8Permissions = [
            'ads_management',
            'ads_read',
            'instagram_basic',
            'instagram_manage_messages',
            'instagram_manage_comments',
            'instagram_content_publish',
            'instagram_manage_insights',
            'instagram_manage_events',
        ].map((name) => ({
            name,
            status: (hasToken && (grantedPerms.size === 0 || grantedPerms.has(name) || !name.startsWith('ads_'))) ? 'GRANTED' : (grantedPerms.has(name) ? 'GRANTED' : 'PENDING'),
        }));
        return success(res, {
            account_type: 'CREATOR',
            username: profile.username || config.INSTAGRAM_USERNAME || null,
            total_followers: profile.followers_count ?? null,
            media_count: profile.media_count ?? null,
            connected: hasToken && Boolean(profile.id || profile.username),
            token_status: hasToken ? 'ACTIVE_SYSTEM_TOKEN' : 'UNCONFIGURED',
            permissions: meta8Permissions,
        });
    }
    catch {
        return success(res, {
            account_type: 'CREATOR',
            username: config.INSTAGRAM_USERNAME || null,
            total_followers: null,
            connected: false,
            token_status: 'UNCONFIGURED',
            permissions: [
                { name: 'ads_management', status: 'UNCONFIGURED' },
                { name: 'ads_read', status: 'UNCONFIGURED' },
                { name: 'instagram_basic', status: 'UNCONFIGURED' },
                { name: 'instagram_manage_messages', status: 'UNCONFIGURED' },
                { name: 'instagram_manage_comments', status: 'UNCONFIGURED' },
                { name: 'instagram_content_publish', status: 'UNCONFIGURED' },
                { name: 'instagram_manage_insights', status: 'UNCONFIGURED' },
                { name: 'instagram_manage_events', status: 'UNCONFIGURED' },
            ],
        });
    }
});
// 9. Meta Webhook Verification
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = String(req.query['hub.verify_token'] || '');
    const challenge = req.query['hub.challenge'];
    const validTokens = [
        config.META_VERIFY_TOKEN,
        config.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
        process.env.META_VERIFY_TOKEN,
        process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
    ].filter((t) => Boolean(t));
    if (mode === 'subscribe' && token && validTokens.includes(token)) {
        logger.info('Meta webhook verified successfully');
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});
// 10. Meta Webhook Events & Real-Time Auto-Reply Dispatcher
router.post('/webhook', async (req, res) => {
    const signature = req.header('x-hub-signature-256');
    const appSecret = config.META_APP_SECRET;
    const rawBody = req.rawBody ||
        (req.body ? Buffer.from(JSON.stringify(req.body), 'utf8') : undefined);
    if (appSecret && signature && rawBody) {
        const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (signatureBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
            logger.warn('Instagram webhook signature mismatch', {
                hasRawBody: Boolean(req.rawBody),
            });
            if (req.rawBody) {
                return res.sendStatus(401);
            }
        }
    }
    else if (appSecret && !signature) {
        logger.warn('Instagram webhook missing x-hub-signature-256 header');
        return res.sendStatus(401);
    }
    else {
        logger.warn('Instagram webhook processed without META_APP_SECRET verification (secret not configured)');
    }
    logger.info('Received and authenticated Instagram Webhook Event');
    const body = (req.body || {});
    const dispatchWebhookDm = async (event, entryId) => {
        if (!event?.message || !event?.sender?.id || event.message.is_echo)
            return;
        const senderId = String(event.sender.id);
        const recipientId = event.recipient?.id ? String(event.recipient.id) : undefined;
        if (recipientId && senderId === recipientId)
            return;
        if (entryId && senderId === String(entryId) && recipientId !== String(entryId))
            return;
        const messageId = event.message.mid || `mid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const messageText = event.message.text || (Array.isArray(event.message.attachments) && event.message.attachments.length > 0 ? '[Media Attachment]' : '');
        const resolvedUsername = event.sender.username ||
            (await lookupInstagramUserById(senderId).catch(() => null)) ||
            'friend';
        logger.info(`Instagram webhook received message for sender ${senderId} (@${resolvedUsername})`);
        if (event.message.reply_to?.note) {
            await handleInstagramNoteActivityEvent({
                eventKey: `note_reply:${messageId}`,
                activityType: 'note_reply',
                noteId: event.message.reply_to.note.id,
                noteText: event.message.reply_to.note.text,
                actorId: senderId,
                actorUsername: resolvedUsername,
                replyText: messageText,
            }).catch(() => { });
        }
        await instagramAutoReplyService.handleIncomingMessage(senderId, resolvedUsername, messageId, messageText, false, {
            attachments: event.message.attachments,
            replyToStoryId: event.message.reply_to?.story?.id,
        });
    };
    // Process webhook events concurrently so serverless runtimes reply well under 10s
    if ((body.object === 'instagram' || body.object === 'page') && Array.isArray(body.entry)) {
        const tasks = [];
        for (const entry of body.entry) {
            const messagingEvents = [
                ...(Array.isArray(entry.messaging) ? entry.messaging : []),
                ...(Array.isArray(entry.standby) ? entry.standby : []),
            ];
            for (const event of messagingEvents) {
                if (event?.message && event?.sender?.id && !event.message.is_echo) {
                    tasks.push(dispatchWebhookDm(event, entry.id).catch((err) => {
                        logger.error('Error handling webhook auto-reply:', err);
                    }));
                }
            }
            if (Array.isArray(entry.changes)) {
                for (const change of entry.changes) {
                    if (change.field === 'messages' && change.value?.message && change.value?.sender?.id) {
                        tasks.push(dispatchWebhookDm(change.value, entry.id).catch((err) => {
                            logger.error('Error handling webhook messages change auto-reply:', err);
                        }));
                    }
                    else if (change.field === 'comments' && change.value?.id) {
                        tasks.push(handleInstagramCommentEvent({
                            commentId: String(change.value.id),
                            mediaId: String(change.value.media?.id || ''),
                            username: String(change.value.from?.username || 'user'),
                            text: String(change.value.text || ''),
                        }).catch(() => { }));
                    }
                    else if (change.field === 'mentions' && (change.value?.media_id || change.value?.comment_id)) {
                        tasks.push(handleInstagramMentionEvent({
                            id: String(change.value.comment_id || change.value.media_id),
                            mediaId: change.value.media_id ? String(change.value.media_id) : undefined,
                            creatorUsername: String(change.value.username || 'creator'),
                            permalink: change.value.permalink,
                            caption: change.value.caption,
                        }).catch(() => { }));
                    }
                }
            }
        }
        if (tasks.length > 0) {
            await Promise.allSettled(tasks);
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
        const scanError = instagramAutoReplyService.getLastScanError();
        if (scanError && repliesSent === 0) {
            return error(res, scanError, 400, 'INSTAGRAM_POLL_ERROR');
        }
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
            error: result.error,
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
        const sendRes = await sendInstagramMessage(senderId, replyText, req.user?.id);
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
// 14. Content Publishing (instagram_content_publish)
const publishSchema = z.object({
    imageUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    caption: z.string().max(2200).optional(),
    mediaType: z.enum(['IMAGE', 'VIDEO', 'REELS', 'STORIES']).optional(),
    coverUrl: z.string().url().optional(),
    shareToFeed: z.boolean().optional(),
});
router.post('/publish', validate(publishSchema), async (req, res) => {
    try {
        const result = await publishInstagramContent(req.body, req.user?.id);
        if (!result.success) {
            return error(res, result.error || 'Content publish failed', 400);
        }
        return success(res, result);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 15. Account Insights (instagram_manage_insights)
router.get('/account-insights', async (req, res) => {
    try {
        const period = (['day', 'week', 'days_28'].includes(String(req.query.period))
            ? String(req.query.period)
            : 'week');
        const data = await getAccountInsights(period, req.user?.id);
        return success(res, data);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 16. Comments Management (instagram_manage_comments)
router.get('/comments/:mediaId', async (req, res) => {
    try {
        const comments = await getMediaComments(String(req.params.mediaId), req.user?.id);
        return success(res, comments);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
const commentReplySchema = z.object({
    message: z.string().min(1).max(1000),
});
router.post('/comments/:commentId/reply', validate(commentReplySchema), async (req, res) => {
    try {
        const result = await replyToInstagramComment(String(req.params.commentId), req.body.message, req.user?.id);
        if (!result.success) {
            return error(res, result.error || 'Failed to reply to comment', 400);
        }
        return success(res, result);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
// 17. Ads Overview (ads_read, ads_management)
router.get('/ads', async (req, res) => {
    try {
        const ads = await getAdsSummary(req.user?.id);
        return success(res, ads);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
});
export default router;
