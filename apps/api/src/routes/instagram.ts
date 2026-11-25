import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { success, error } from '../utils/response.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  getInstagramProfile,
  getInstagramMedia,
  getInstagramConversations,
  getThreadDetails,
  sendInstagramMessage,
  draftInstagramReply,
  executeInstagramVoiceCommand,
} from '../providers/instagram.js';
import { instagramAutoReplyService } from '../services/instagramAutoReply.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';

const router = Router();

router.use((req, res, next) => {
  if (req.path === '/webhook') {
    return next();
  }
  if (config.NODE_ENV !== 'production') {
    return next();
  }
  return requireAuth(req, res, () => requireOwner(req, res, next));
});

// In-memory store for VIP contacts
let vipContacts: string[] = ['_.raghul._.15', 'tech_colleague', 'founder_friend'];

// 1. Live Profile
router.get('/profile', async (_req, res) => {
  try {
    const profile = await getInstagramProfile();
    return success(res, profile);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// 2. Live Media & Posts / Reels
router.get('/media', async (_req, res) => {
  try {
    const media = await getInstagramMedia();
    return success(res, media);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// 3. Live Conversations (threads)
router.get('/conversations', async (_req, res) => {
  try {
    const conversations = await getInstagramConversations();
    return success(res, conversations);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// 4. Thread details
router.get('/conversations/:id', async (req, res) => {
  try {
    const messages = await getThreadDetails(req.params.id);
    return success(res, messages);
  } catch (err: any) {
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
  } catch (err: any) {
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
  } catch (err: any) {
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
  } catch (err: any) {
    logger.error('Voice command error:', err);
    return error(res, err.message || 'Voice command failed', 500);
  }
});

// 7. VIP / Favourite contacts
router.get('/favourites', (_req, res) => {
  return success(res, vipContacts);
});

router.post('/favourites', (req, res) => {
  const username = req.body?.username;
  if (username && !vipContacts.includes(username)) {
    vipContacts.push(username);
  }
  return success(res, vipContacts);
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
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
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
              await instagramAutoReplyService.handleIncomingMessage(
                senderId,
                senderUsername,
                messageId,
                messageText
              );
            } catch (err) {
              logger.error('Error handling webhook auto-reply:', err);
            }
          }
        }
      }
    }
  }

  return res.status(200).send('EVENT_RECEIVED');
});

// 11. Auto-Reply Configuration & Audit Endpoints
router.get('/auto-reply', (_req, res) => {
  return success(res, {
    config: instagramAutoReplyService.getConfig(),
    logs: instagramAutoReplyService.getLogs(),
  });
});

const autoReplyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  triggerMode: z.enum(['all', 'contains_hi']).optional(),
  customTemplate: z.string().optional(),
  aiProvider: z.enum(['groq', 'gemini', 'copilot']).optional(),
  aiModel: z.string().optional(),
});

router.post('/auto-reply/config', validate(autoReplyConfigSchema), (req, res) => {
  const updated = instagramAutoReplyService.updateConfig(req.body);
  return success(res, updated);
});

router.post('/auto-reply/toggle', (req, res) => {
  const current = instagramAutoReplyService.getConfig();
  const updated = instagramAutoReplyService.updateConfig({ enabled: !current.enabled });
  return success(res, updated);
});

router.post('/auto-reply/poll', async (_req, res) => {
  try {
    const repliesSent = await instagramAutoReplyService.scanAndAutoReply();
    return success(res, {
      message: `Scanned active Instagram conversations. ${repliesSent} auto-reply messages dispatched.`,
      repliesSent,
      logs: instagramAutoReplyService.getLogs(),
    });
  } catch (err: any) {
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

    const result = await instagramAutoReplyService.handleIncomingMessage(
      senderId,
      senderUsername,
      messageId,
      messageText,
      true
    );

    return success(res, {
      simulated: true,
      sender: { id: senderId, username: senderUsername },
      incomingMessage: messageText,
      autoReplied: result.autoReplied,
      replyText: result.replyText,
      logs: instagramAutoReplyService.getLogs(),
    });
  } catch (err: any) {
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
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;
