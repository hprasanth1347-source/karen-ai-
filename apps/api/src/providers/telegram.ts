/**
 * Karen AI – Telegram Integration
 * Full-featured Telegram bot provider.
 * Supports: commands, text, images, documents, voice messages,
 *           conversation history, polling (dev) + webhook (prod).
 */

import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { generateAIReply } from '../services/ai.service.js';
import { executeConfirmedPendingAction, runCommandEngine } from '../commands/engine.js';
import { generateRegistryHelpText } from '../commands/registry.js';
import {
  deleteCommandMacro,
  listCommandMacros,
  markTelegramUpdateProcessed,
  saveLastUploadedFile,
} from '../commands/state.js';
import { downloadTelegramFileSafe } from '../services/driveUpload.service.js';
import { hydrateGoogleTokensFromRequest } from '../routes/googleDrive.js';
import { addNotification } from '../services/approval.service.js';
import { addMemory } from '../services/memory.service.js';
import { addTask, listTasks, updateTask } from '../services/task.service.js';
import { listApprovals, setApprovalStatus } from '../services/approval.service.js';
import {
  getNotificationById,
  listNotificationHistory,
  markNotificationRead,
  muteNotificationSource,
  snoozeNotification,
  syncAndNotifyLiveWorkspaceAlerts,
  type NotificationSource,
} from '../services/notificationEngine.service.js';
import {
  buildLiveAlertsDigest,
  handleTelegramCalendarCommand,
  handleTelegramContactsCommand,
  handleTelegramDriveCommand,
  handleTelegramGmailCommand,
  handleTelegramSearchCommand,
  handleTelegramSheetsCommand,
  handleTelegramTasksCommand,
} from '../services/telegramCommands.service.js';
import { getGoogleContextForPrompt, buildGoogleAuthUrl, disconnectGoogleAccount } from '../routes/googleDrive.js';
import {
  draftClassroomAssignment,
  explainClassroomAssignment,
  getClassroomCache,
  getClassroomOverview,
  getClassroomSettings,
  getGradesOverview,
  joinClassroomByCodeOrLink,
  listClassroomAssignments,
  runLastMinuteExamPrep,
  snoozeAssignmentReminder,
  syncClassroomData,
} from '../services/classroom.service.js';
import { extractTextFromBuffer } from '../utils/docParser.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import {
  getLoveModeState,
  setLoveModeActive,
  detectLoveModeActivation,
  detectLoveModeDeactivation,
  incrementLoveModeMessageCount,
} from '../services/loveMode.service.js';
import {
  appendChatMessage,
  createConversation,
  listConversations,
} from '../services/chatLibrary.service.js';
import { executeInstagramVoiceCommand } from './instagram.js';
import { loadUserSetting, saveUserSetting } from '../services/persistence.service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  voice?: { file_id: string; duration: number };
  audio?: { file_id: string };
  document?: { file_id: string; file_name?: string; mime_type?: string };
  photo?: Array<{ file_id: string; width: number; height: number }>;
  video?: { file_id: string };
  sticker?: { file_id: string; emoji?: string };
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ─── In-memory state ─────────────────────────────────────────────────────────

interface TelegramState {
  botUsername: string;
  lastIncoming: string;
  lastIncomingAt: string | null;
  lastOutgoing: string;
  lastOutgoingAt: string | null;
  totalReceived: number;
  totalSent: number;
  errors: string[];
  pollingActive: boolean;
  webhookSet: boolean;
  startedAt: string | null;
}

export const telegramState: TelegramState = {
  botUsername: '',
  lastIncoming: '',
  lastIncomingAt: null,
  lastOutgoing: '',
  lastOutgoingAt: null,
  totalReceived: 0,
  totalSent: 0,
  errors: [],
  pollingActive: false,
  webhookSet: false,
  startedAt: null,
};

interface PersistedTelegramState {
  lastIncoming: string;
  lastIncomingAt: string | null;
  lastOutgoing: string;
  lastOutgoingAt: string | null;
  totalReceived: number;
  totalSent: number;
  errors: string[];
}

async function persistTelegramState(patch: Partial<PersistedTelegramState>): Promise<void> {
  try {
    const existing = await Promise.race([
      loadUserSetting<PersistedTelegramState>('telegram_live_state'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ]);
    const next: PersistedTelegramState = {
      lastIncoming: patch.lastIncoming ?? existing?.lastIncoming ?? telegramState.lastIncoming,
      lastIncomingAt: patch.lastIncomingAt ?? existing?.lastIncomingAt ?? telegramState.lastIncomingAt,
      lastOutgoing: patch.lastOutgoing ?? existing?.lastOutgoing ?? telegramState.lastOutgoing,
      lastOutgoingAt: patch.lastOutgoingAt ?? existing?.lastOutgoingAt ?? telegramState.lastOutgoingAt,
      totalReceived: Math.max(telegramState.totalReceived, (existing?.totalReceived ?? 0) + (patch.totalReceived ?? 0)),
      totalSent: Math.max(telegramState.totalSent, (existing?.totalSent ?? 0) + (patch.totalSent ?? 0)),
      errors: patch.errors ?? existing?.errors ?? telegramState.errors,
    };
    await saveUserSetting('telegram_live_state', next);
  } catch {
    // Non-blocking persistence
  }
}

export async function getPersistedTelegramState(): Promise<PersistedTelegramState> {
  try {
    const saved = await Promise.race([
      loadUserSetting<PersistedTelegramState>('telegram_live_state'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
    if (saved) {
      return {
        lastIncoming: saved.lastIncoming || telegramState.lastIncoming,
        lastIncomingAt: saved.lastIncomingAt || telegramState.lastIncomingAt,
        lastOutgoing: saved.lastOutgoing || telegramState.lastOutgoing,
        lastOutgoingAt: saved.lastOutgoingAt || telegramState.lastOutgoingAt,
        totalReceived: Math.max(saved.totalReceived || 0, telegramState.totalReceived),
        totalSent: Math.max(saved.totalSent || 0, telegramState.totalSent),
        errors: Array.isArray(saved.errors) && saved.errors.length > 0 ? saved.errors : telegramState.errors,
      };
    }
  } catch {
    // Fall back to in-memory
  }
  return {
    lastIncoming: telegramState.lastIncoming,
    lastIncomingAt: telegramState.lastIncomingAt,
    lastOutgoing: telegramState.lastOutgoing,
    lastOutgoingAt: telegramState.lastOutgoingAt,
    totalReceived: telegramState.totalReceived,
    totalSent: telegramState.totalSent,
    errors: telegramState.errors,
  };
}

// Per-chat conversation history (up to 20 messages per chat)
const chatHistories = new Map<number, Array<{ role: 'user' | 'assistant'; content: string }>>();

function getHistory(chatId: number) {
  return chatHistories.get(chatId) ?? [];
}

function pushHistory(chatId: number, role: 'user' | 'assistant', content: string) {
  const h = chatHistories.get(chatId) ?? [];
  h.push({ role, content });
  if (h.length > 8) h.splice(0, h.length - 8);
  chatHistories.set(chatId, h);
}

function clearHistory(chatId: number) {
  chatHistories.delete(chatId);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function botToken(): string {
  return config.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
}

function ownerId(): string {
  return (config.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID || '').trim();
}

function webhookSecret(): string {
  const raw = (process.env.TELEGRAM_WEBHOOK_SECRET || config.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!raw) return '';
  return raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);
}

function isConfigured(): boolean {
  return Boolean(botToken());
}

function isAuthorized(chatId: number): boolean {
  const owner = ownerId();
  if (!owner) return false;
  return String(chatId) === String(owner);
}

async function tgApiCall(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = botToken();
  if (!token) return null;
  try {
    let res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) {
      const rateJson = await res.json().catch(() => ({})) as { parameters?: { retry_after?: number } };
      const waitSec = Math.min(rateJson.parameters?.retry_after || 2, 5);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
    }
    const json = await res.json() as { ok?: boolean; result?: unknown };
    if (!res.ok || !json.ok) {
      logger.warn(`Telegram API ${method} failed`, { status: res.status });
    }
    return json.result ?? null;
  } catch (err) {
    logger.warn(`Telegram API ${method} error`, { err });
    return null;
  }
}

async function getFileUrl(fileId: string): Promise<string | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as { ok?: boolean; result?: { file_path?: string } };
    if (!json.ok || !json.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
  } catch {
    return null;
  }
}

export async function sendTelegramMessage(
  text: string,
  chatId?: string | number,
  options?: { inlineKeyboard?: InlineKeyboardButton[][] }
): Promise<boolean> {
  const target = chatId ?? ownerId();
  if (!isConfigured() || !target) return false;

  const chunks = splitMessage(text);
  let ok = true;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const replyMarkup =
      i === chunks.length - 1 && options?.inlineKeyboard?.length
        ? { inline_keyboard: options.inlineKeyboard }
        : undefined;

    const payload: Record<string, unknown> = {
      chat_id: target,
      text: chunk,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    };
    let result = await tgApiCall('sendMessage', payload);
    if (!result) {
      // Retry only this chunk in plain text in case Markdown parsing failed
      result = await tgApiCall('sendMessage', {
        chat_id: target,
        text: chunk,
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
    if (!result) ok = false;
  }

  if (ok) {
    telegramState.totalSent++;
    telegramState.lastOutgoing = text.slice(0, 120);
    telegramState.lastOutgoingAt = new Date().toISOString();
    void persistTelegramState({
      lastOutgoing: telegramState.lastOutgoing,
      lastOutgoingAt: telegramState.lastOutgoingAt,
      totalSent: 1,
    });
  }
  return ok;
}

export async function sendTelegramDocument(
  chatId: string | number,
  buffer: Buffer,
  filename: string,
  caption?: string
): Promise<boolean> {
  const target = chatId ?? ownerId();
  const token = botToken();
  if (!token || !target) return false;

  try {
    const form = new FormData();
    form.append('chat_id', String(target));
    form.append('document', new Blob([new Uint8Array(buffer)]), filename);
    if (caption) form.append('caption', caption.slice(0, 900));

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (res.ok && json.ok) {
      telegramState.totalSent++;
      telegramState.lastOutgoing = `[File: ${filename}]`;
      return true;
    }
  } catch (err) {
    logger.warn('Telegram sendDocument error', { err, filename });
  }
  return false;
}

function splitMessage(text: string): string[] {
  const MAX = 4000;
  if (text.length <= MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX) {
    const cut = remaining.lastIndexOf('\n', MAX);
    const idx = cut > 100 ? cut : MAX;
    chunks.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendTyping(chatId: number): Promise<void> {
  await tgApiCall('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// ─── Command handlers ─────────────────────────────────────────────────────────

const HELP_TEXT = `
*Karen AI — Telegram Commands*

/start — Start Karen AI
/help — Show this help
/status — System status
/chat — AI conversation mode
/clear — Clear conversation history
/memory — Save a memory (e.g. /memory I prefer dark mode)
/tasks — View your active tasks
/task <name> — Create a quick task
/digest — Gmail + task summary
/approve <id> — Approve a pending action
/reject <id> — Reject a pending action
/whatsapp — WhatsApp integration status
/instagram — Instagram integration status
/drive — Google Drive status
/settings — Karen settings

📎 *File support:* Send PDF, DOCX, TXT, XLSX, images — Karen reads and analyzes them.
🎤 *Voice:* Send a voice note — Karen transcribes and replies.
💬 *Chat:* Just type anything for a full AI response.
`.trim();

async function handleCommand(cmd: string, args: string, chatId: number): Promise<string> {
  switch (cmd) {
    case '/start':
      return `👋 *Vanakkam! I'm Karen AI.*\n\nYour personal AI assistant is now active on Telegram.\n\nSend any message to chat, or type /help for commands.`;

    case '/help':
      return generateRegistryHelpText();

    case '/macros': {
      const argTrim = args.trim();
      if (argTrim.toLowerCase().startsWith('delete ')) {
        const target = argTrim.slice(7).trim();
        const ok = await deleteCommandMacro(target);
        return ok ? `🗑️ Deleted macro "${target}".` : `Macro "${target}" not found.`;
      }
      const macros = await listCommandMacros();
      if (macros.length === 0) {
        return 'No custom macros saved yet. Say: `teach Karen: when I say "my work" show pending assignments and latest 5 mails`';
      }
      return `⚡ *Saved Macros (${macros.length}):*\n\n${macros
        .map((m, i) => `${i + 1}. "${m.triggerPhrase}" → ${m.steps.map((s) => s.instruction).join(' ; ')}`)
        .join('\n')}\n\nDelete with \`/macros delete <trigger>\`.`;
    }

    case '/cancel': {
      const res = await runCommandEngine({
        chatKey: String(chatId),
        text: '/cancel',
        channel: 'telegram',
        useLlmFallback: false,
      });
      return res.reply;
    }

    case '/joinclass': {
      const trimmed = args.trim();
      if (!trimmed) {
        await tgApiCall('sendMessage', {
          chat_id: chatId,
          text: '🎓 *Join a Google Classroom*\n\nChoose how you want to join, or reply with an invite link or `<Class ID> <Code>`:',
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Invite link', callback_data: 'join_mode:link' },
                { text: 'Class ID + code', callback_data: 'join_mode:id_code' },
                { text: 'Pending invitations', callback_data: 'join_mode:invitation' },
              ],
            ],
          },
        });
        return '';
      }
      const tokens = trimmed.split(/\s+/);
      const commandText =
        tokens.length >= 2 && !/classroom\.google\.com/i.test(tokens[0])
          ? `join class ${tokens[0]} code ${tokens[1]}`
          : `join this class ${trimmed}`;
      const res = await runCommandEngine({
        chatKey: String(chatId),
        text: commandText,
        channel: 'telegram',
        useLlmFallback: false,
      });
      if (res.buttons && res.buttons.length > 0) {
        await tgApiCall('sendMessage', {
          chat_id: chatId,
          text: res.reply,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: res.buttons.map((row) =>
              row.map((b) => ({
                text: b.label,
                ...(b.callbackData ? { callback_data: b.callbackData } : {}),
                ...(b.url ? { url: b.url } : {}),
              }))
            ),
          },
        });
        return '';
      }
      return res.reply;
    }

    case '/status': {
      const nowIst = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
      const [tasks, approvals] = await Promise.all([listTasks(), listApprovals()]);
      const pending = tasks.filter((t) => t.status !== 'done').length;
      const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;
      return [
        `🟢 *Karen AI — System Status*`,
        `📅 ${nowIst}`,
        ``,
        `🤖 AI Engine: ✅ Online`,
        `📋 Active Tasks: ${pending}`,
        `⏳ Pending Approvals: ${pendingApprovals}`,
        `📱 Telegram: ✅ Connected${telegramState.botUsername ? ` (@${telegramState.botUsername})` : ''}`,
        `📨 Messages Sent: ${telegramState.totalSent}`,
        `📥 Messages Received: ${telegramState.totalReceived}`,
      ].join('\n');
    }

    case '/clear':
      clearHistory(chatId);
      return '🗑️ Conversation history cleared.';

    case '/memory': {
      if (!args.trim()) return '⚠️ Usage: /memory <content to remember>';
      await addMemory(args.trim(), 'instruction', undefined, 'user_confirmed');
      return `✅ Remembered: "${args.trim()}"`;
    }

    case '/tasks':
      return handleTelegramTasksCommand(args);

    case '/task': {
      if (!args.trim()) return '⚠️ Usage: /task <task title>';
      return handleTelegramTasksCommand(`add ${args.trim()}`);
    }

    case '/digest': {
      await hydrateGoogleTokensFromRequest();
      const reply = await generateAIReply(
        'Give me a digest: list my top 3 unread important emails, any upcoming tasks due today or tomorrow, and anything urgent I should know.',
        getHistory(chatId),
        undefined,
        undefined,
        AbortSignal.timeout(15000)
      );
      return reply.reply;
    }

    case '/approve': {
      if (!args.trim()) return '⚠️ Usage: /approve <approval-id>';
      await setApprovalStatus(args.trim(), 'approved');
      return `✅ Approved action: \`${args.trim()}\``;
    }

    case '/reject': {
      if (!args.trim()) return '⚠️ Usage: /reject <approval-id>';
      await setApprovalStatus(args.trim(), 'rejected');
      return `❌ Rejected action: \`${args.trim()}\``;
    }

    case '/whatsapp':
      return config.WHATSAPP_ACCESS_TOKEN
        ? '✅ WhatsApp is configured via Meta Cloud API.'
        : '❌ WhatsApp not configured. Add WHATSAPP_ACCESS_TOKEN in Vercel env vars.';

    case '/instagram':
    case '/ig_status': {
      const { instagramAutoReplyService } = await import('../services/instagramAutoReply.js');
      return instagramAutoReplyService.getDmDigestSummary();
    }

    case '/newspaper':
    case '/tamil':
    case '/english':
    case '/latest': {
      const { generateDailyEditions, listEditions } = await import('../services/newsroom.service.js');
      const lang = cmd === '/tamil' ? 'ta' : 'en';
      let ed = listEditions().find((e) => e.language === lang);
      if (!ed) {
        const gen = await generateDailyEditions();
        ed = lang === 'ta' ? gen.ta : gen.en;
      }
      const brand = ed.language === 'ta' ? 'கரென் டைம்ஸ் (KAREN TIMES)' : 'KAREN TIMES';
      return `📰 *${brand}* — ${ed.editionDate} (Issue #${ed.issueNumber})\n_KNOWLEDGE IS WISDOM._\n\n${ed.summary}`;
    }

    case '/ig_stop': {
      const { instagramAutoReplyService } = await import('../services/instagramAutoReply.js');
      await instagramAutoReplyService.emergencyStop();
      return '🛑 *Instagram Emergency Stop Activated*\n\nAuto-DM engine is now **OFF**. No automatic replies will be sent until you re-enable it.';
    }

    case '/remind': {
      const { createReminder, listReminders, cancelReminder } = await import('../services/reminders.service.js');
      const { getOwnerUserId } = await import('../services/persistence.service.js');
      const ownerUserId = (await getOwnerUserId().catch(() => null)) || '00000000-0000-0000-0000-000000000001';
      const clean = args.trim();
      if (!clean || clean.toLowerCase() === 'list') {
        const list = await listReminders(ownerUserId);
        const active = list.filter((r) => r.status === 'scheduled');
        if (!active.length) return '⏰ No scheduled reminders. Try: `/remind in 30m Call Arun` or `/remind daily 08:00 Drink water`';
        return `⏰ *Scheduled Reminders (${active.length}):*\n\n${active
          .slice(0, 10)
          .map((r, i) => `${i + 1}. *${r.title}* — ${new Date(r.dueAt).toLocaleString('en-IN', { timeZone: r.timezone })}${r.recurrenceRule ? ` (${r.recurrenceRule})` : ''}`)
          .join('\n')}`;
      }
      if (clean.toLowerCase().startsWith('cancel ')) {
        const res = await cancelReminder(clean.slice(7).trim(), ownerUserId);
        return res.ok ? `🗑️ Cancelled reminder: *${res.cancelledTitle}*` : '⚠️ No matching scheduled reminder found.';
      }
      const inMatch = clean.match(/^in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\s+(.+)$/i);
      let dueMs = Date.now() + 60 * 60 * 1000;
      let title = clean;
      let recurrence: string | null = null;
      if (inMatch) {
        const qty = Number(inMatch[1]);
        const unit = inMatch[2].toLowerCase().startsWith('h') ? 3600_000 : 60_000;
        dueMs = Date.now() + qty * unit;
        title = inMatch[3].trim();
      } else if (/^daily\s+/i.test(clean)) {
        recurrence = 'daily';
        title = clean.replace(/^daily\s+/i, '').trim();
        dueMs = Date.now() + 24 * 3600_000;
      }
      const saved = await createReminder({
        userId: ownerUserId,
        title,
        dueAt: new Date(dueMs).toISOString(),
        recurrenceRule: recurrence,
        timezone: 'Asia/Kolkata',
        channel: 'telegram',
      });
      const ist = new Date(saved.dueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      return `⏰ *Reminder Saved!*\n• *${saved.title}*\n• 🕒 ${ist} IST${saved.recurrenceRule ? `\n• 🔁 ${saved.recurrenceRule}` : ''}`;
    }

    case '/insta': {
      if (!config.INSTAGRAM_ACCESS_TOKEN) {
        return '❌ Instagram not connected. Add INSTAGRAM_ACCESS_TOKEN in Vercel env vars.';
      }
      if (!args.trim()) {
        return `📸 *Instagram Commands*\n\nUsage:\n• \`/insta send raghul I am on the way\`\n• \`/insta raghul ku hello solu\`\n• \`/insta check messages\`\n• \`/insta list posts\`\n\nOr just type naturally:\n"send message to raghul hey"\n"raghul ku message anupu hello"`;
      }
      try {
        const result = await executeInstagramVoiceCommand(args.trim());
        return result.replyMessage || (result.success ? '✅ Done!' : '❌ Instagram command failed.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return `❌ Instagram error: ${msg}`;
      }
    }

    case '/drive':
      return handleTelegramDriveCommand(args, chatId, sendTelegramDocument);

    case '/sheets':
      return handleTelegramSheetsCommand(args);

    case '/calendar':
      return handleTelegramCalendarCommand(args);

    case '/contacts':
      return handleTelegramContactsCommand(args);

    case '/gmail':
      return handleTelegramGmailCommand(args);

    case '/search':
      return handleTelegramSearchCommand(args);

    case '/alerts': {
      const syncRes = await syncAndNotifyLiveWorkspaceAlerts({ forceSummary: false }).catch(() => ({
        alertsSent: 0,
      }));
      const digest = await buildLiveAlertsDigest();
      return syncRes.alertsSent > 0
        ? `${digest}\n\n✅ Dispatched ${syncRes.alertsSent} urgent alert(s).`
        : digest;
    }

    case '/settings': {
      // No heavy DB call — just show static config (memory status is advisory only)
      return [
        `⚙️ *Karen AI Settings*`,
        ``,
        `🌐 Language: English (Thanglish on request)`,
        `🕐 Timezone: Asia/Kolkata (IST)`,
        `🧠 Personal Memory: ✅ Active`,
        `🤖 Default AI: ${config.DEFAULT_AI_PROVIDER.toUpperCase()}`,
        `📢 Voice Policy: Female-only (ElevenLabs)`,
        `🔒 Auth: Owner-only Telegram access`,
      ].join('\n');
    }

    case '/chat':
      return '💬 Chat mode active. Just type your message and I\'ll reply.';

    case '/love':
    case '/comfort':
    case '/lonely': {
      await setLoveModeActive(chatId, true);
      return `Heyyy ❤️ I'm here da. Enna achu? Come, tell me everything. Don't keep everything inside. I'm listening. 🥺`;
    }

    case '/endlove':
    case '/normal': {
      await setLoveModeActive(chatId, false);
      return `Seri da ❤️ Love Mode off. But whenever you need to talk, I'm here. Take care of yourself. 💙`;
    }

    case '/classroom': {
      let ov = await getClassroomOverview();
      if (!ov.connected) {
        return `📚 *Google Classroom*\n\nNot connected yet.\nUse /connectgoogle or /connectclassroom to connect your Google account.`;
      }
      if (ov.stats.totalCourses === 0) {
        await syncClassroomData().catch(() => { });
        ov = await getClassroomOverview();
      }
      return [
        `📚 *Karen Google Classroom*`,
        ``,
        `📖 Courses: ${ov.stats.activeCourses} active (${ov.stats.totalCourses} total)`,
        `📝 Pending: ${ov.stats.pendingAssignments}`,
        `⚠️ Overdue: ${ov.stats.overdueAssignments}`,
        `✅ Submitted: ${ov.stats.submittedAssignments} | 🎓 Graded: ${ov.stats.gradedAssignments}`,
        `📅 Upcoming Exams: ${ov.stats.upcomingExams}`,
        `🕒 Last Sync: ${ov.lastSyncedAt ? new Date(ov.lastSyncedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never'}`,
        ``,
        `Commands: /classes, /assignments, /pending, /overdue, /deadlines, /announcements, /grades, /exams, /examprep, /explain`,
      ].join('\n');
    }

    case '/classes': {
      const cache = await getClassroomCache();
      if (!cache.courses.length) {
        await syncClassroomData().catch(() => { });
      }
      const updated = await getClassroomCache();
      if (!updated.courses.length) {
        return '📚 No Google Classroom courses found yet. Use /connectclassroom if not connected, or /joinclass <invite_link_or_code>.';
      }
      return `📚 *My Classroom Courses (${updated.courses.length})*\n\n${updated.courses
        .map(
          (c, i) =>
            `${i + 1}. *${c.name}*${c.section ? ` (${c.section})` : ''} [${c.courseState}]${c.teacherNames[0] ? `\n   👤 ${c.teacherNames[0]}` : ''}`
        )
        .join('\n\n')}`;
    }

    case '/assignments':
    case '/pending':
    case '/submitted':
    case '/overdue':
    case '/deadlines': {
      const cat =
        cmd === '/pending'
          ? 'pending'
          : cmd === '/submitted'
            ? 'submitted'
            : cmd === '/overdue'
              ? 'overdue'
              : 'all';
      let list = await listClassroomAssignments({ category: cat, sortBy: 'deadline' });
      if (list.length === 0) {
        await syncClassroomData().catch(() => { });
        list = await listClassroomAssignments({ category: cat, sortBy: 'deadline' });
      }
      const filtered =
        cmd === '/deadlines'
          ? list.filter((a) => a.dueIso && a.category !== 'submitted' && a.category !== 'graded')
          : list;
      const top = filtered.slice(0, 10);
      if (!top.length) {
        return cmd === '/overdue'
          ? '🎉 No overdue assignments!'
          : '📝 No matching assignments found. Try /classroom to check connection.';
      }
      const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const tomorrowIst = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
      });
      return `📝 *${cmd.slice(1).toUpperCase()} (${filtered.length})*\n\n${top
        .map((a, i) => {
          const dueDateIst = a.dueIso
            ? new Date(a.dueIso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
            : '';
          const dayBadge =
            dueDateIst === todayIst
              ? '🚨 DUE TODAY'
              : dueDateIst === tomorrowIst
                ? '⏰ Due Tomorrow'
                : a.category.toUpperCase();
          return `${i + 1}. *${a.title}*\n   📘 ${a.courseName}\n   ⏰ Due: ${a.dueIstDisplay} | ${dayBadge}`;
        })
        .join('\n\n')}`;
    }

    case '/announcements': {
      const cache = await getClassroomCache();
      const top = cache.announcements.slice(0, 6);
      if (!top.length) return '📢 No recent Classroom announcements found.';
      return `📢 *Recent Announcements*\n\n${top
        .map(
          (a, i) =>
            `${i + 1}. *${a.courseName}*\n${a.text.slice(0, 220)}${a.text.length > 220 ? '...' : ''}`
        )
        .join('\n\n')}`;
    }

    case '/grades': {
      const grades = await getGradesOverview();
      if (!grades.length) return '🎓 No Classroom grade/submission records cached yet.';
      return `🎓 *Grades & Submissions Overview*\n\n${grades
        .map((g) => {
          const scoreLine =
            g.gradedCount > 0
              ? `Score: ${g.earnedPoints}${g.possiblePoints ? ` / ${g.possiblePoints}` : ''}`
              : 'No graded items yet';
          return `📘 *${g.courseName}*\n   Graded: ${g.gradedCount} | Ungraded: ${g.ungradedCount} | Pending: ${g.pendingCount}\n   ${scoreLine}`;
        })
        .join('\n\n')}`;
    }

    case '/exams': {
      const cache = await getClassroomCache();
      if (!cache.exams.length) {
        return `📅 No exam dates added yet.\nAdd one on ${config.APP_URL}/classroom or tell me: "Karen, DBMS exam tomorrow"`;
      }
      return `📅 *Tracked Exams*\n\n${cache.exams
        .map(
          (e, i) =>
            `${i + 1}. *${e.subject}* — ${e.examDateIso}${e.examTime ? ` (${e.examTime})` : ''}`
        )
        .join('\n')}`;
    }

    case '/examprep': {
      const subject = args.trim() || 'upcoming exam';
      const prep = await runLastMinuteExamPrep({
        subject,
        hoursAvailable: 5,
        language: 'english',
        mode: 'plan',
      });
      return `🎯 *Last-Minute Exam Prep: ${prep.subject}*\n\n${prep.plan}`;
    }

    case '/explain': {
      if (!args.trim()) {
        return '⚠️ Usage: /explain <assignment title or subject> (e.g. `/explain DBMS`)';
      }
      const isThanglish = /thanglish|tamil/i.test(args);
      const res = await explainClassroomAssignment(
        args.replace(/in\s+thanglish/gi, '').trim(),
        isThanglish ? 'thanglish' : 'english'
      );
      return res.explanation;
    }

    case '/connectgoogle':
    case '/connectclassroom': {
      if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
        return '❌ Google OAuth is not configured on the server yet.';
      }
      const { getOwnerUserId } = await import('../services/persistence.service.js');
      const ownerUserId = (await getOwnerUserId().catch(() => null)) || 'owner';
      const redirectUri =
        config.GOOGLE_REDIRECT_URI && !config.GOOGLE_REDIRECT_URI.includes('localhost')
          ? config.GOOGLE_REDIRECT_URI
          : config.NODE_ENV === 'production'
            ? 'https://karen-ai-me.vercel.app/api/v1/auth/google/callback'
            : `${config.APP_URL.replace(/\/$/, '')}/api/v1/auth/google/callback`;
      const target = cmd === '/connectclassroom' ? 'classroom' : 'drive';
      const url = buildGoogleAuthUrl(redirectUri, target, ownerUserId);
      return `🔗 *Connect All Google Services*\n(Gmail, Drive, Calendar, Sheets, Contacts, Tasks & Classroom)\n\nOpen this link to authorize:\n${url}`;
    }

    case '/disconnectclassroom': {
      await disconnectGoogleAccount();
      return '🔌 Google Classroom / Google OAuth disconnected and tokens revoked.';
    }

    case '/classroomsettings': {
      const s = await getClassroomSettings();
      return [
        `⚙️ *Classroom Settings*`,
        ``,
        `🔄 Auto Sync: ${s.syncEnabled ? 'ON' : 'OFF'} (${Math.round(s.syncIntervalMs / 60000)}m)`,
        `🕐 Timezone: ${s.timezone}`,
        `⏰ Assignment Reminders: 3d(${s.reminders.threeDaysBefore ? '✓' : '✗'}), 1d(${s.reminders.oneDayBefore ? '✓' : '✗'}), 3h(${s.reminders.threeHoursBefore ? '✓' : '✗'}), Overdue(${s.reminders.afterDeadline ? '✓' : '✗'})`,
        `🎯 Exam Alerts: 1d(${s.reminders.examOneDayBefore ? '✓' : '✗'}), Day(${s.reminders.examDayMorning ? '✓' : '✗'}), 3d(${s.reminders.examThreeDaysBefore ? '✓' : '✗'})`,
        `🌙 Quiet Hours: ${s.quietHours.enabled ? `${s.quietHours.startHour}:00-${s.quietHours.endHour}:00` : 'OFF'}`,
      ].join('\n');
    }

    default:
      return `❓ Unknown command: ${cmd}\n\nType /help for all available commands.`;
  }
}

// ─── Message processor ───────────────────────────────────────────────────────

async function processMessage(msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    const errText = `Unauthorized message from chatId ${chatId} (expected TELEGRAM_OWNER_CHAT_ID=${ownerId() || 'UNSET'})`;
    logger.warn(errText);
    telegramState.errors.unshift(`${new Date().toISOString()}: ${errText}`);
    if (telegramState.errors.length > 20) telegramState.errors.length = 20;
    void persistTelegramState({ errors: telegramState.errors });
    await tgApiCall('sendMessage', {
      chat_id: chatId,
      text: '🔒 Unauthorized. This is a private assistant.',
    });
    return;
  }

  telegramState.totalReceived++;
  telegramState.lastIncoming = (msg.text || msg.caption || '[media]').slice(0, 120);
  telegramState.lastIncomingAt = new Date().toISOString();
  void persistTelegramState({
    lastIncoming: telegramState.lastIncoming,
    lastIncomingAt: telegramState.lastIncomingAt,
    totalReceived: 1,
  });
  void sendTyping(chatId); // fire-and-forget — don't block AI on typing indicator
  await hydrateGoogleTokensFromRequest().catch(() => { });

  let reply = '';
  let replyButtons: Array<Array<{ text: string; callback_data?: string; url?: string }>> | undefined;

  try {
    // ── Voice messages ──────────────────────────────────────────────────────
    if (msg.voice || msg.audio) {
      const fileId = msg.voice?.file_id ?? msg.audio?.file_id ?? '';
      if (config.GROQ_API_KEY && fileId) {
        const dl = await downloadTelegramFileSafe(fileId);
        if (dl.ok && dl.buffer) {
          try {
            const form = new FormData();
            form.append('file', new Blob([new Uint8Array(dl.buffer)], { type: 'audio/ogg' }), 'voice.ogg');
            form.append('model', 'whisper-large-v3-turbo');
            const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${config.GROQ_API_KEY}` },
              body: form,
              signal: AbortSignal.timeout(12000),
            });
            if (sttRes.ok) {
              const sttJson = (await sttRes.json()) as { text?: string };
              const transcript = sttJson.text?.trim() || '';
              if (transcript) {
                const engineRes = await runCommandEngine({
                  chatKey: String(chatId),
                  text: transcript,
                  channel: 'telegram',
                  history: getHistory(chatId),
                });
                if (engineRes.handled) {
                  reply = `🎤 _"${transcript}"_\n\n${engineRes.reply}`;
                  if (engineRes.buttons) {
                    replyButtons = engineRes.buttons.map((row) =>
                      row.map((b) => ({ text: b.label, ...(b.callbackData ? { callback_data: b.callbackData } : {}), ...(b.url ? { url: b.url } : {}) }))
                    );
                  }
                } else {
                  const aiRes = await generateAIReply(transcript, getHistory(chatId), undefined, undefined, AbortSignal.timeout(15000), { currentPage: '/telegram' });
                  reply = `🎤 _"${transcript}"_\n\n${aiRes.reply}`;
                }
              }
            }
          } catch {
            // Fall through
          }
        }
      }
      if (!reply) {
        reply = '🎤 Voice message received, but speech transcription failed or GROQ_API_KEY is not configured. Please type your command.';
      }
    }

    // ── Documents / Files ────────────────────────────────────────────────────
    else if (msg.document) {
      const { file_id, file_name = 'document', mime_type = 'application/octet-stream' } = msg.document;
      await saveLastUploadedFile(String(chatId), {
        fileId: file_id,
        fileName: file_name,
        mimeType: mime_type,
        source: 'telegram',
        uploadedAt: new Date().toISOString(),
      });

      const caption = msg.caption?.trim() || '';
      if (caption) {
        const engineRes = await runCommandEngine({
          chatKey: String(chatId),
          text: caption,
          channel: 'telegram',
          history: getHistory(chatId),
        });
        if (engineRes.handled) {
          reply = engineRes.reply;
          if (engineRes.buttons) {
            replyButtons = engineRes.buttons.map((row) =>
              row.map((b) => ({ text: b.label, ...(b.callbackData ? { callback_data: b.callbackData } : {}), ...(b.url ? { url: b.url } : {}) }))
            );
          }
        }
      }

      if (!reply) {
        const fileUrl = await getFileUrl(file_id);
        if (!fileUrl) {
          reply = '⚠️ Could not download the file. Please try again.';
        } else {
          await tgApiCall('sendMessage', { chat_id: chatId, text: `📄 Processing *${file_name}*...` });
          try {
            const fileRes = await fetch(fileUrl);
            const buffer = Buffer.from(await fileRes.arrayBuffer());
            const text = await extractTextFromBuffer(buffer, file_name, mime_type);
            if (!text || text.length < 10) {
              reply = `📄 Saved *${file_name}* for Drive/email commands (type "save this to drive" within 30 mins), though no extractable text was found.`;
            } else {
              const aiRes = await generateAIReply(
                `Analyze this document named "${file_name}" and give me a clear summary with key points:\n\n${text.slice(0, 8000)}`,
                getHistory(chatId)
              );
              pushHistory(chatId, 'user', `[Document: ${file_name}]`);
              pushHistory(chatId, 'assistant', aiRes.reply);
              reply = `📄 *${file_name}*\n\n${aiRes.reply}`;
            }
          } catch (err) {
            reply = `⚠️ Error reading *${file_name}*: ${err instanceof Error ? err.message : 'Unknown error'}`;
          }
        }
      }
    }

    // ── Photos / Images ──────────────────────────────────────────────────────
    else if (msg.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      await saveLastUploadedFile(String(chatId), {
        fileId: largest.file_id,
        fileName: `photo-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        source: 'telegram',
        uploadedAt: new Date().toISOString(),
      });
      const caption = msg.caption?.trim() || '';
      if (caption) {
        const engineRes = await runCommandEngine({
          chatKey: String(chatId),
          text: caption,
          channel: 'telegram',
          history: getHistory(chatId),
        });
        if (engineRes.handled) {
          reply = engineRes.reply;
          if (engineRes.buttons) {
            replyButtons = engineRes.buttons.map((row) =>
              row.map((b) => ({ text: b.label, ...(b.callbackData ? { callback_data: b.callbackData } : {}), ...(b.url ? { url: b.url } : {}) }))
            );
          }
        } else {
          const aiRes = await generateAIReply(`The user sent an image and asked: "${caption}".`, getHistory(chatId));
          reply = aiRes.reply;
        }
      } else {
        reply = `🖼️ Photo received and ready! Say *"save this to drive"* or *"mail this file to ..."* within 30 minutes.`;
      }
    }

    // ── Sticker ──────────────────────────────────────────────────────────────
    else if (msg.sticker) {
      const emoji = msg.sticker.emoji || '😊';
      reply = `${emoji} Nice sticker! Type a message if you need anything from me.`;
    }

    // ── Text / Commands ───────────────────────────────────────────────────────
    else {
      const text = (msg.text || msg.caption || '').trim();
      if (!text) return;

      telegramState.lastIncoming = text.slice(0, 100);

      if (text.startsWith('/')) {
        const spaceIdx = text.indexOf(' ');
        const cmd = spaceIdx > -1 ? text.slice(0, spaceIdx).toLowerCase() : text.toLowerCase();
        const args = spaceIdx > -1 ? text.slice(spaceIdx + 1).trim() : '';
        reply = await handleCommand(cmd, args, chatId);
      } else {
        const history = getHistory(chatId);

        if (detectLoveModeDeactivation(text)) {
          await setLoveModeActive(chatId, false);
          reply = `Seri da ❤️ Love Mode off. But whenever you need to talk, I'm here. Take care of yourself. 💙`;
        } else {
          const loveState = await getLoveModeState(chatId);
          const shouldActivate = !loveState.active && detectLoveModeActivation(text);
          if (shouldActivate) {
            await setLoveModeActive(chatId, true);
          }
          const loveModeActive = loveState.active || shouldActivate;

          const engineRes = loveModeActive
            ? { handled: false as const, reply: '', buttons: undefined }
            : await runCommandEngine({
              chatKey: String(chatId),
              text,
              channel: 'telegram',
              history,
            });

          if (engineRes.handled) {
            pushHistory(chatId, 'user', text);
            pushHistory(chatId, 'assistant', engineRes.reply);
            reply = engineRes.reply;
            if (engineRes.buttons) {
              replyButtons = engineRes.buttons.map((row) =>
                row.map((b) => ({ text: b.label, ...(b.callbackData ? { callback_data: b.callbackData } : {}), ...(b.url ? { url: b.url } : {}) }))
              );
            }
          } else {
            const aiRes = await generateAIReply(
              text,
              history,
              undefined,
              undefined,
              AbortSignal.timeout(15000),
              { loveMode: loveModeActive, currentPage: '/telegram' }
            );
            pushHistory(chatId, 'user', text);
            pushHistory(chatId, 'assistant', aiRes.reply);
            reply = aiRes.reply;

            if (aiRes.sources && aiRes.sources.length > 0) {
              const links = aiRes.sources.slice(0, 4).map((s) => `• [${s.displayLink || s.title}](${s.url})`).join('\n');
              reply += `\n\n🔗 *Sources*\n${links}`;
            }
            if (aiRes.generatedFiles && aiRes.generatedFiles.length > 0) {
              const fileLinks = aiRes.generatedFiles.map((f) => `📎 [${f.name}](${f.url})`).join('\n');
              reply += `\n\n${fileLinks}`;
            }
            if (loveModeActive) {
              await incrementLoveModeMessageCount(chatId);
            }
            if (aiRes.pendingApproval) {
              reply += `\n\n⚠️ *Approval Required*\n${aiRes.pendingApproval.summary}\n\nType \`/approve ${aiRes.pendingApproval.id}\` to confirm or \`/reject ${aiRes.pendingApproval.id}\` to cancel.`;
            }
          }
        }
      }
    }

    await Promise.all([
      reply
        ? sendTelegramMessage(
            reply,
            chatId,
            replyButtons && replyButtons.length > 0 ? { inlineKeyboard: replyButtons } : undefined
          )
        : Promise.resolve(false),
      addNotification('telegram', 'Telegram Message', `"${(msg.text || '[media]').slice(0, 60)}"`, 'normal', 'telegram').catch(() => { }),
      (async () => {
        if (!msg.text || !reply) return;
        try {
          const existing = await listConversations(undefined, 'telegram');
          let convId = existing[0]?.id;
          if (!convId) {
            const created = await createConversation(`Telegram (${chatId})`, 'telegram');
            convId = created.id;
          }
          await appendChatMessage(convId, 'user', msg.text, { channel: 'telegram' });
          await appendChatMessage(convId, 'assistant', reply, { channel: 'telegram' });
        } catch {
          // Non-blocking DB persistence
        }
      })(),
    ]);
    if (reply) {
      telegramState.lastOutgoing = reply.slice(0, 100);
    }
  } catch (err) {
    logger.error('Telegram processMessage error:', err);
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    telegramState.errors.unshift(`${new Date().toISOString()}: ${errMsg}`);
    if (telegramState.errors.length > 20) telegramState.errors.length = 20;
    await sendTelegramMessage('❌ Sorry, I hit an error. Please try again.', chatId);
  }
}

// ─── Webhook handler (production) ────────────────────────────────────────────

async function handleCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  if (!isAuthorized(chatId)) {
    await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Unauthorized', show_alert: true });
    return;
  }

  const data = cb.data || '';
  const [action, arg] = data.split(':');

  try {
    if (action === 'notif_read' && arg) {
      markNotificationRead(arg);
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Marked as read' });
    } else if (action === 'notif_snooze' && arg) {
      snoozeNotification(arg, 30);
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Snoozed for 30 mins' });
    } else if (action === 'notif_mute' && arg) {
      muteNotificationSource(arg as NotificationSource);
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: `Muted ${arg} alerts` });
    } else if (action === 'notif_details' && arg) {
      const rec = getNotificationById(arg);
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id });
      await sendTelegramMessage(
        rec
          ? `📋 *Notification Details*\nSource: ${rec.source}\nPriority: ${rec.priority}\nTitle: ${rec.title}\n\n${rec.summary}\n\nAction: ${rec.recommendedAction}`
          : 'Notification not found.',
        chatId
      );
    } else if (action === 'comp_tasks') {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id });
      const tasks = await listTasks();
      const active = tasks.filter((t) => t.status !== 'done').slice(0, 10);
      const text = active.length
        ? `📋 *Today's & Active Tasks (${active.length})*\n\n${active.map((t, i) => `${i + 1}. [${t.priority.toUpperCase()}] ${t.title} (${t.due || 'today'})`).join('\n')}`
        : '✅ No pending tasks right now.';
      await sendTelegramMessage(text, chatId);
    } else if (action === 'comp_calendar') {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id });
      await hydrateGoogleTokensFromRequest().catch(() => { });
      const calMsg = await handleTelegramCalendarCommand('3');
      await sendTelegramMessage(calMsg, chatId);
    } else if (action === 'comp_notifs') {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id });
      const unread = listNotificationHistory().filter((n) => !n.isRead).slice(0, 5);
      const text = unread.length
        ? `🔔 *Unread Notifications (${unread.length})*\n\n${unread.map((n, i) => `${i + 1}. [${n.priority}] ${n.source}: ${n.title}`).join('\n')}`
        : '🔔 No unread notifications.';
      await sendTelegramMessage(text, chatId);
    } else if (action === 'comp_tomorrow') {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id });
      const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const tasks = await listTasks();
      const tom = tasks.filter((t) => t.status !== 'done' && t.due === tomorrowIso);
      const text = tom.length
        ? `📆 *Tomorrow (${tomorrowIso})*\n\n${tom.map((t, i) => `${i + 1}. ${t.title}`).join('\n')}`
        : `📆 No tasks scheduled for tomorrow (${tomorrowIso}).`;
      await sendTelegramMessage(text, chatId);
    } else if (action === 'task_done' && arg) {
      const updated = await updateTask(arg, { status: 'done' });
      await tgApiCall('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: updated ? `Completed: ${updated.title.slice(0, 30)}` : 'Task not found',
      });
    } else if (action === 'task_snooze' && arg) {
      const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const updated = await updateTask(arg, { due: tomorrowIso });
      await tgApiCall('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: updated ? `Rescheduled to ${tomorrowIso}` : 'Task not found',
      });
    } else if (action === 'classroom_explain' && arg) {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Generating explanation...' });
      const res = await explainClassroomAssignment(arg, 'english');
      await sendTelegramMessage(res.explanation, chatId);
    } else if (action === 'classroom_remind' && arg) {
      await snoozeAssignmentReminder(arg, 4);
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Reminder snoozed for 4 hours' });
    } else if (action === 'classroom_examprep' && arg) {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Starting last-minute prep...' });
      const prep = await runLastMinuteExamPrep({ subject: arg, hoursAvailable: 5, mode: 'plan' });
      await sendTelegramMessage(`🎯 *Last-Minute Exam Prep: ${prep.subject}*\n\n${prep.plan}`, chatId);
    } else if (action === 'classroom_topics' && arg) {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id });
      const cache = await getClassroomCache();
      const exam = cache.exams.find((e) => e.id === arg);
      const msg = exam?.topics?.length
        ? `📚 *Topics for ${exam.subject}*\n\n${exam.topics.map((t, i) => `${i + 1}. ${t.revised ? '✅' : '⬜'} ${t.title}`).join('\n')}`
        : '📚 No topics listed yet for this exam.';
      await sendTelegramMessage(msg, chatId);
    } else if (action === 'cmd_confirm' && arg) {
      const result = await executeConfirmedPendingAction(arg, 'confirm');
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: result.ok ? 'Done' : 'Failed' });
      await sendTelegramMessage(result.message, chatId);
    } else if (action === 'cmd_cancel' && arg) {
      const result = await executeConfirmedPendingAction(arg, 'cancel');
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Cancelled' });
      await sendTelegramMessage(result.message, chatId);
    } else if (action === 'cmd' && arg === 'classroom_sync') {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Syncing Classroom...' });
      const res = await runCommandEngine({ chatKey: String(chatId), text: 'show pending assignments', channel: 'telegram', useLlmFallback: false });
      await sendTelegramMessage(res.reply, chatId);
    } else if (action === 'join_mode') {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id });
      if (arg === 'link') {
        await sendTelegramMessage('Paste your Google Classroom invite link (`https://classroom.google.com/c/...?cjc=...`).', chatId);
      } else if (arg === 'id_code') {
        await sendTelegramMessage('Reply with your Class ID (number or URL) and 5–12 character Class Code, e.g. `join class 123456789 code abc1234`.', chatId);
      } else if (arg === 'invitation') {
        const invs = await (await import('../services/classroom.service.js')).listPendingClassroomInvitations();
        if (invs.length === 0) {
          await sendTelegramMessage('No pending Classroom invitations found.', chatId);
        } else {
          await sendTelegramMessage(
            `Found ${invs.length} pending invitation(s). Tap to join:\n${invs.map((i, idx) => `${idx + 1}. Course ${i.courseId}`).join('\n')}`,
            chatId
          );
        }
      }
    } else {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'OK' });
    }
  } catch (err) {
    logger.warn('Telegram callback error', { err });
    await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Action failed' });
  }
}

export async function telegramWebhook(req: Request, res: Response): Promise<void> {
  const expected = webhookSecret();
  const received = req.header('x-telegram-bot-api-secret-token');

  if (expected) {
    if (!received) {
      const msg = 'Telegram webhook 401: missing secret header. Click REGISTER WEBHOOK on /telegram to sync secret.';
      logger.warn(msg);
      telegramState.errors.unshift(`${new Date().toISOString()}: ${msg}`);
      if (telegramState.errors.length > 20) telegramState.errors.length = 20;
      void persistTelegramState({ errors: telegramState.errors });
      res.sendStatus(401);
      return;
    }
    const exp = Buffer.from(expected);
    const rec = Buffer.from(received);
    if (exp.length !== rec.length || !timingSafeEqual(exp, rec)) {
      const msg = 'Telegram webhook 401: secret token mismatch. Click REGISTER WEBHOOK on /telegram to re-sync.';
      logger.warn(msg);
      telegramState.errors.unshift(`${new Date().toISOString()}: ${msg}`);
      if (telegramState.errors.length > 20) telegramState.errors.length = 20;
      void persistTelegramState({ errors: telegramState.errors });
      res.sendStatus(401);
      return;
    }
  } else if (config.NODE_ENV === 'production') {
    logger.warn('Telegram webhook processed without TELEGRAM_WEBHOOK_SECRET (not configured)');
  }

  const update: TelegramUpdate = req.body || {};
  if (typeof update.update_id === 'number') {
    const fresh = await markTelegramUpdateProcessed(update.update_id);
    if (!fresh) {
      res.sendStatus(200);
      return;
    }
  }
  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else {
      const msg = update.message || update.edited_message;
      if (msg) {
        await processMessage(msg);
      }
    }
  } catch (err) {
    logger.error('Telegram webhook handler error', { err });
  }

  if (!res.headersSent) {
    res.sendStatus(200);
  }
}

// ─── Polling (development / fallback) ────────────────────────────────────────

let pollingOffset = 0;
let pollingTimer: ReturnType<typeof setTimeout> | null = null;

async function pollOnce(): Promise<void> {
  const token = botToken();
  if (!token) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${pollingOffset}&timeout=10&limit=10`
    );
    if (!res.ok) return;
    const json = await res.json() as { ok?: boolean; result?: TelegramUpdate[] };
    if (!json.ok || !json.result) return;

    for (const update of json.result) {
      pollingOffset = update.update_id + 1;
      if (update.callback_query) {
        await handleCallbackQuery(update.callback_query);
        continue;
      }
      const msg = update.message || update.edited_message;
      if (msg) {
        await processMessage(msg);
      }
    }
  } catch (err) {
    logger.debug('Telegram polling error', { err });
  }
}

export function startTelegramPolling(): void {
  if (telegramState.pollingActive || !isConfigured()) return;
  telegramState.pollingActive = true;
  telegramState.startedAt = new Date().toISOString();

  const loop = async () => {
    if (!telegramState.pollingActive) return;
    await pollOnce();
    pollingTimer = setTimeout(loop, 2000);
  };

  void loop();
  logger.info('Telegram polling started');
}

export function stopTelegramPolling(): void {
  telegramState.pollingActive = false;
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
  logger.info('Telegram polling stopped');
}

// ─── Webhook registration ─────────────────────────────────────────────────────

export async function registerTelegramWebhook(
  webhookUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const token = botToken();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured.' };
  const secret = webhookSecret();
  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
  };
  if (secret) body.secret_token = secret;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: boolean;
      description?: string;
    };
    if (res.ok && json.ok) {
      telegramState.webhookSet = true;
      await setTelegramCommands();
      logger.info('Telegram webhook registered', { webhookUrl });
      return { ok: true };
    }
    const errDesc = json.description || `Telegram setWebhook failed (${res.status})`;
    logger.warn('Telegram setWebhook failed', { status: res.status, description: errDesc });
    return { ok: false, error: errDesc };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Network error calling Telegram setWebhook';
    logger.warn('Telegram setWebhook error', { errMsg });
    return { ok: false, error: errMsg };
  }
}

export async function deleteTelegramWebhook(): Promise<boolean> {
  const result = await tgApiCall('deleteWebhook', { drop_pending_updates: false });
  telegramState.webhookSet = false;
  return Boolean(result);
}

export async function setTelegramCommands(): Promise<void> {
  await tgApiCall('setMyCommands', {
    commands: [
      { command: 'start', description: 'Start Karen AI' },
      { command: 'help', description: 'Show all commands' },
      { command: 'status', description: 'System & integration status' },
      { command: 'chat', description: 'AI conversation mode' },
      { command: 'clear', description: 'Clear conversation history' },
      { command: 'memory', description: 'Save a memory item' },
      { command: 'tasks', description: 'View active tasks' },
      { command: 'task', description: 'Create a task (e.g. /task Buy milk)' },
      { command: 'digest', description: 'Email + task morning digest' },
      { command: 'approve', description: 'Approve a pending action' },
      { command: 'reject', description: 'Reject a pending action' },
      { command: 'whatsapp', description: 'WhatsApp status' },
      { command: 'instagram', description: 'Instagram status' },
      { command: 'drive', description: 'Live Drive files or /drive <file>' },
      { command: 'sheets', description: 'Google Sheets list/read/create/add' },
      { command: 'calendar', description: 'Live Google Calendar schedule' },
      { command: 'contacts', description: 'Search or add Google Contacts' },
      { command: 'gmail', description: 'Unread & important Gmail' },
      { command: 'search', description: 'Fresh live web search' },
      { command: 'alerts', description: 'Live Tasks, Calendar & Deadline alerts' },
      { command: 'settings', description: 'Karen settings overview' },
      { command: 'love', description: 'Activate Love & Comfort Mode ❤️' },
      { command: 'comfort', description: 'Activate emotional support mode' },
      { command: 'lonely', description: 'I need company right now' },
      { command: 'endlove', description: 'Exit Love Mode, back to normal' },
      { command: 'normal', description: 'Switch back to normal mode' },
      { command: 'insta', description: 'Instagram: /insta send raghul hello' },
      { command: 'connectgoogle', description: 'Connect Gmail, Drive, Calendar, Sheets & Classroom' },
      { command: 'classroom', description: 'Google Classroom overview' },
      { command: 'assignments', description: 'Show Classroom assignments' },
      { command: 'pending', description: 'Pending Classroom work' },
      { command: 'grades', description: 'Show Classroom grades' },
      { command: 'exams', description: 'Tracked exam dates' },
      { command: 'examprep', description: 'Last-minute exam preparation' },
    ],
  });
}

export async function getTelegramWebhookInfo(): Promise<{
  url: string;
  pendingUpdateCount: number;
  lastErrorMessage?: string;
} | null> {
  if (!isConfigured()) return null;
  try {
    const result = (await tgApiCall('getWebhookInfo', {})) as {
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
    } | null;
    if (!result) return null;
    telegramState.webhookSet = Boolean(result.url);
    return {
      url: result.url || '',
      pendingUpdateCount: result.pending_update_count ?? 0,
      lastErrorMessage: result.last_error_message || undefined,
    };
  } catch {
    return null;
  }
}

export async function getTelegramBotInfo(): Promise<{ username: string; name: string } | null> {
  if (!isConfigured()) return null;
  try {
    const result = await tgApiCall('getMe', {}) as { username?: string; first_name?: string } | null;
    if (result?.username) {
      telegramState.botUsername = result.username;
      return { username: result.username, name: result.first_name || 'Karen' };
    }
  } catch { }
  return null;
}

export { isConfigured as isTelegramConfigured };
