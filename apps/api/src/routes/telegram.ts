/**
 * Karen AI — /telegram API route
 * Dashboard status, webhook registration, polling control, test send,
 * Proactive Notification Centre, and Daily Companion configuration.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  telegramState,
  isTelegramConfigured,
  getTelegramBotInfo,
  registerTelegramWebhook,
  deleteTelegramWebhook,
  setTelegramCommands,
  startTelegramPolling,
  stopTelegramPolling,
  sendTelegramMessage,
  telegramWebhook,
} from '../providers/telegram.js';
import {
  getNotificationPreferences,
  getNotificationStats,
  listNotificationHistory,
  markNotificationRead,
  processNotificationEvent,
  retryFailedNotifications,
  updateNotificationPreferences,
  type NotificationPriority,
  type NotificationSource,
} from '../services/notificationEngine.service.js';
import {
  generateAndSendGreeting,
  getCompanionConfig,
  getGreetingHistory,
  updateCompanionConfig,
  type GreetingSlot,
} from '../services/dailyCompanion.service.js';
import { config } from '../config/env.js';
import { success, error } from '../utils/response.js';

const router = Router();

/** GET /telegram/status — bot info + live metrics */
router.get('/telegram/status', async (_req, res) => {
  const configured = isTelegramConfigured();
  let botInfo: { username: string; name: string } | null = null;
  if (configured) {
    botInfo = await getTelegramBotInfo().catch(() => null);
  }

  return success(res, {
    configured,
    botUsername: botInfo?.username ?? (telegramState.botUsername || null),
    botName: botInfo?.name ?? null,
    ownerChatId: config.TELEGRAM_OWNER_CHAT_ID || null,
    pollingActive: telegramState.pollingActive,
    webhookSet: telegramState.webhookSet,
    lastIncoming: telegramState.lastIncoming
      ? { text: telegramState.lastIncoming, timestamp: telegramState.startedAt || new Date().toISOString() }
      : null,
    lastOutgoing: telegramState.lastOutgoing
      ? { text: telegramState.lastOutgoing, timestamp: telegramState.startedAt || new Date().toISOString() }
      : null,
    totalReceived: telegramState.totalReceived,
    totalSent: telegramState.totalSent,
    errors: telegramState.errors.slice(0, 5).map((e) => ({
      message: e,
      timestamp: new Date().toISOString(),
    })),
    startedAt: telegramState.startedAt,
  });
});

/** POST /telegram/register-webhook — register webhook URL */
router.post('/telegram/register-webhook', async (req, res) => {
  if (!isTelegramConfigured()) {
    return error(res, 'TELEGRAM_BOT_TOKEN is not configured.', 400, 'TELEGRAM_NOT_CONFIGURED');
  }

  const schema = z.object({
    url: z.string().url().optional(),
  });
  const parsed = schema.safeParse(req.body);
  const webhookUrl = parsed.success && parsed.data.url
    ? parsed.data.url
    : `https://karen-ai-me.vercel.app/api/v1/telegram/webhook`;

  const ok = await registerTelegramWebhook(webhookUrl);
  if (ok) {
    return success(res, { registered: true, webhookUrl });
  }
  return error(res, 'Failed to register webhook with Telegram.', 502);
});

/** POST /telegram/delete-webhook — remove webhook (use polling) */
router.post('/telegram/delete-webhook', async (_req, res) => {
  if (!isTelegramConfigured()) {
    return error(res, 'TELEGRAM_BOT_TOKEN is not configured.', 400, 'TELEGRAM_NOT_CONFIGURED');
  }
  const ok = await deleteTelegramWebhook();
  return success(res, { deleted: ok });
});

/** POST /telegram/start-polling — begin local long-polling */
router.post('/telegram/start-polling', (_req, res) => {
  if (!isTelegramConfigured()) {
    return error(res, 'TELEGRAM_BOT_TOKEN is not configured.', 400, 'TELEGRAM_NOT_CONFIGURED');
  }
  if (telegramState.pollingActive) {
    return success(res, { alreadyActive: true });
  }
  startTelegramPolling();
  return success(res, { pollingStarted: true });
});

/** POST /telegram/stop-polling — stop long-polling */
router.post('/telegram/stop-polling', (_req, res) => {
  stopTelegramPolling();
  return success(res, { pollingStopped: true });
});

/** POST /telegram/set-commands — register bot commands in Telegram */
router.post('/telegram/set-commands', async (_req, res) => {
  if (!isTelegramConfigured()) {
    return error(res, 'TELEGRAM_BOT_TOKEN is not configured.', 400, 'TELEGRAM_NOT_CONFIGURED');
  }
  await setTelegramCommands();
  return success(res, { commandsSet: true });
});

/** POST /telegram/send — test send a message to owner */
router.post('/telegram/send', async (req, res) => {
  if (!isTelegramConfigured()) {
    return error(res, 'TELEGRAM_BOT_TOKEN is not configured.', 400, 'TELEGRAM_NOT_CONFIGURED');
  }
  const schema = z.object({ text: z.string().min(1).max(4000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'text is required.', 400);
  }
  const ok = await sendTelegramMessage(parsed.data.text);
  if (ok) {
    return success(res, { sent: true });
  }
  return error(res, 'Failed to send Telegram message. Check TELEGRAM_OWNER_CHAT_ID.', 502);
});

/** GET /telegram/notifications — Proactive Notification Centre state */
router.get('/telegram/notifications', (req, res) => {
  const priority = req.query.priority as NotificationPriority | undefined;
  return success(res, {
    stats: getNotificationStats(),
    preferences: getNotificationPreferences(),
    history: listNotificationHistory(priority).slice(0, 50),
  });
});

/** PUT /telegram/notifications/preferences — update notification preferences */
router.put('/telegram/notifications/preferences', (req, res) => {
  const updated = updateNotificationPreferences(req.body || {});
  return success(res, updated);
});

/** POST /telegram/notifications/test-event — emit a test notification through the engine */
router.post('/telegram/notifications/test-event', async (req, res) => {
  const schema = z.object({
    source: z.enum(['whatsapp', 'instagram', 'gmail', 'calendar', 'drive', 'tasks', 'system', 'files', 'automation']).default('system'),
    title: z.string().min(1).default('Test Proactive Alert'),
    sender: z.string().optional(),
    body: z.string().min(1).default('This is a test proactive notification from Karen AI.'),
    suggestedPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return error(res, 'Invalid notification test payload', 400);
  }
  const record = await processNotificationEvent({
    source: parsed.data.source as NotificationSource,
    title: parsed.data.title,
    sender: parsed.data.sender,
    body: parsed.data.body,
    suggestedPriority: parsed.data.suggestedPriority as NotificationPriority | undefined,
  });
  return success(res, record);
});

/** POST /telegram/notifications/:id/read — mark notification as read */
router.post('/telegram/notifications/:id/read', (req, res) => {
  const updated = markNotificationRead(String(req.params.id));
  if (!updated) return error(res, 'Notification not found', 404);
  return success(res, updated);
});

/** POST /telegram/notifications/retry-failed — retry failed Telegram deliveries */
router.post('/telegram/notifications/retry-failed', async (_req, res) => {
  const result = await retryFailedNotifications();
  return success(res, result);
});

/** GET /telegram/companion/config — Daily Companion greeting schedule & history */
router.get('/telegram/companion/config', (_req, res) => {
  return success(res, {
    config: getCompanionConfig(),
    history: getGreetingHistory().slice(0, 20),
  });
});

/** PUT /telegram/companion/config — update Daily Companion schedule & language */
router.put('/telegram/companion/config', (req, res) => {
  const updated = updateCompanionConfig(req.body || {});
  return success(res, updated);
});

/** POST /telegram/companion/trigger — manually send a greeting slot */
router.post('/telegram/companion/trigger', async (req, res) => {
  const schema = z.object({
    slot: z.enum(['morning', 'afternoon', 'evening', 'night']).default('morning'),
    force: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return error(res, 'Invalid greeting slot', 400);
  const result = await generateAndSendGreeting(parsed.data.slot as GreetingSlot, {
    force: parsed.data.force,
  });
  return success(res, result);
});

/** POST /telegram/webhook — Telegram Bot API webhook endpoint */
router.post('/telegram/webhook', telegramWebhook);

export default router;
