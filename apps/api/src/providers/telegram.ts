/**
 * Karen AI – Telegram Integration
 * Full-featured Telegram bot provider.
 * Supports: commands, text, images, documents, voice messages,
 *           conversation history, polling (dev) + webhook (prod).
 */

import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { generateAIReply } from '../services/ai.service.js';
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
  type NotificationSource,
} from '../services/notificationEngine.service.js';
import { getGoogleContextForPrompt, buildGoogleAuthUrl, disconnectGoogleAccount } from '../routes/googleDrive.js';
import {
  draftClassroomAssignment,
  explainClassroomAssignment,
  getClassroomCache,
  getClassroomOverview,
  getClassroomSettings,
  getGradesOverview,
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
import { executeInstagramVoiceCommand } from './instagram.js';

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
  lastOutgoing: string;
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
  lastOutgoing: '',
  totalReceived: 0,
  totalSent: 0,
  errors: [],
  pollingActive: false,
  webhookSet: false,
  startedAt: null,
};

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
  return config.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID || '';
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
    telegramState.lastOutgoing = text.slice(0, 100);
  }
  return ok;
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
      return HELP_TEXT;

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

    case '/tasks': {
      const tasks = await listTasks();
      const active = tasks.filter((t) => t.status !== 'done').slice(0, 10);
      if (active.length === 0) return '✅ No active tasks.';
      const lines = active.map((t, i) => `${i + 1}. [${t.priority.toUpperCase()}] ${t.title} — ${t.due || 'no due date'}`);
      return `📋 *Active Tasks (${active.length}):*\n\n${lines.join('\n')}`;
    }

    case '/task': {
      if (!args.trim()) return '⚠️ Usage: /task <task title>';
      const task = await addTask(args.trim(), undefined, 'medium', 'telegram');
      return `✅ Task created: *${task.title}*`;
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
      return config.INSTAGRAM_ACCESS_TOKEN
        ? `✅ Instagram connected (Account: @${config.INSTAGRAM_PAGE_ID || 'owner'}).`
        : '❌ Instagram not configured. Add INSTAGRAM_ACCESS_TOKEN in Vercel env vars.';

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
      return config.GOOGLE_CLIENT_ID
        ? '✅ Google Drive OAuth is configured. Connect at karen-ai-me.vercel.app/drive'
        : '❌ Google Drive not configured. Add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Vercel env vars.';

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
      const ov = await getClassroomOverview();
      if (!ov.connected) {
        return `📚 *Google Classroom*\n\nNot connected yet.\nUse /connectclassroom or open ${config.APP_URL}/classroom to connect your Google account.`;
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
        await syncClassroomData().catch(() => {});
      }
      const updated = await getClassroomCache();
      if (!updated.courses.length) {
        return '📚 No Google Classroom courses found yet. Use /connectclassroom if not connected.';
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
    case '/overdue':
    case '/deadlines': {
      const cat =
        cmd === '/pending' ? 'pending' : cmd === '/overdue' ? 'overdue' : 'all';
      const list = await listClassroomAssignments({ category: cat, sortBy: 'deadline' });
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
      return `📝 *${cmd.slice(1).toUpperCase()} (${filtered.length})*\n\n${top
        .map(
          (a, i) =>
            `${i + 1}. *${a.title}*\n   📘 ${a.courseName}\n   ⏰ Due: ${a.dueIstDisplay} | Status: ${a.category.toUpperCase()}`
        )
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

    case '/connectclassroom': {
      if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
        return '❌ Google OAuth is not configured on the server yet.';
      }
      const base = config.APP_URL.replace(/\/$/, '');
      const url = buildGoogleAuthUrl(`${base}/api/v1/auth/google/callback`, 'classroom');
      return `🔗 *Connect Google Classroom*\n\nOpen this link to authorize read-only Classroom access:\n${url}`;
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
    logger.warn('Telegram: unauthorized message from chat', { chatId });
    await tgApiCall('sendMessage', {
      chat_id: chatId,
      text: '🔒 Unauthorized. This is a private assistant.',
    });
    return;
  }

  telegramState.totalReceived++;
  void sendTyping(chatId); // fire-and-forget — don't block AI on typing indicator

  let reply = '';

  try {
    // ── Voice messages ──────────────────────────────────────────────────────
    if (msg.voice || msg.audio) {
      const fileId = msg.voice?.file_id ?? msg.audio?.file_id ?? '';
      const fileUrl = await getFileUrl(fileId);
      if (fileUrl) {
        reply = `🎤 *Voice message received.*\n\nSorry, I can't transcribe audio files directly yet — Telegram sends them as OGG/OPUS format which requires a speech-to-text service. Please type your message or send it as text.\n\n*Tip:* Connect ElevenLabs or Google Speech-to-Text for voice transcription.`;
      } else {
        reply = '⚠️ Could not download the voice message. Please try again.';
      }
    }

    // ── Documents / Files ────────────────────────────────────────────────────
    else if (msg.document) {
      const { file_id, file_name = 'document', mime_type = '' } = msg.document;
      const fileUrl = await getFileUrl(file_id);
      if (!fileUrl) {
        reply = '⚠️ Could not download the file. Please try again.';
      } else {
        await tgApiCall('sendMessage', { chat_id: chatId, text: `📄 Processing *${file_name}*...` });
        try {
          const fileRes = await fetch(fileUrl);
          const arrayBuf = await fileRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const text = await extractTextFromBuffer(buffer, file_name, mime_type);
          if (!text || text.length < 10) {
            reply = `⚠️ Could not extract text from *${file_name}*. It may be a scanned image or encrypted PDF.`;
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

    // ── Photos / Images ──────────────────────────────────────────────────────
    else if (msg.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      const caption = msg.caption?.trim() || 'Describe this image.';
      const fileUrl = await getFileUrl(largest.file_id);
      if (!fileUrl) {
        reply = '⚠️ Could not download the image.';
      } else {
        // Karen doesn't have vision API yet — provide a helpful message
        reply = `🖼️ *Image received.*\n\nI can see you sent a photo${msg.caption ? ` with caption: "${msg.caption}"` : ''}.\n\n_I don't have image analysis (vision) capability yet. Please describe what you need help with or use /drive to access your Google Drive documents._`;
        const questionPart = caption !== 'Describe this image.' ? caption : '';
        if (questionPart) {
          const aiRes = await generateAIReply(`The user sent an image and asked: "${questionPart}". I cannot see images but I can help with text-based questions about it.`, getHistory(chatId));
          reply = aiRes.reply;
        }
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
        // Full AI conversation — no Google hydration needed here (only for /digest or Drive commands)
        const history = getHistory(chatId);

        // ── Instagram natural language detection ──────────────────────────────
        const isInstagramCommand = config.INSTAGRAM_ACCESS_TOKEN && (
          /\b(send\s+(msg|message|dm)\s+to|dm|tell)\s+\w/i.test(text) ||
          /\b\w+\s+(ku|kku)\s+(msg|message|anupu|solu)\b/i.test(text) ||
          /\b(check|read)\s+(my\s+)?(instagram\s+)?(dms?|messages?|inbox)\b/i.test(text) ||
          /\binsta(gram)?\s+(dm|message|send)\b/i.test(text)
        );

        if (isInstagramCommand) {
          try {
            const result = await executeInstagramVoiceCommand(text);
            reply = result.replyMessage || (result.success ? '✅ Done!' : '❌ Instagram action failed.');
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            reply = `❌ Instagram error: ${msg}`;
          }
        }
        // ── Google Classroom natural language detection ─────────────────────
        else if (
          /\b(my\s+assignments?|pending\s+(work|assignments?)|assignment\s+is\s+due|due\s+tomorrow|show\s+my\s+grades|my\s+classes|new\s+announcements?|next\s+exam|exam\s+tomorrow|prepare\s+me\s+for.*exam|start\s+exam\s+prep|i\s+have\s+only\s+\d+\s+hours?|haven'?t\s+studied\s+anything|explain\s+my\s+.*assignment|prepare\s+an?\s+assignment\s+draft)\b/i.test(text)
        ) {
          if (/\b(exam\s+tomorrow|prepare\s+me|start\s+exam\s+prep|i\s+have\s+only\s+\d+\s+hours?|haven'?t\s+studied)\b/i.test(text)) {
            const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*hours?/i);
            const hours = hoursMatch ? Number(hoursMatch[1]) : 5;
            const subjectMatch = text.match(/(?:for|have)\s+([a-z0-9 &_-]{2,40}?)\s+exam/i);
            const subject = subjectMatch?.[1]?.trim() || text;
            const prep = await runLastMinuteExamPrep({
              subject,
              hoursAvailable: hours,
              language: /thanglish|tamil/i.test(text) ? 'thanglish' : 'english',
              mode: 'plan',
            });
            reply = `🎯 *Last-Minute Exam Prep (${prep.subject})*\n\n${prep.plan}`;
          } else if (/\bexplain\b/i.test(text)) {
            const res = await explainClassroomAssignment(
              text,
              /thanglish|tamil/i.test(text) ? 'thanglish' : 'english'
            );
            reply = res.explanation;
          } else if (/\bdraft\b/i.test(text)) {
            const list = await listClassroomAssignments({ category: 'pending' });
            if (!list.length) {
              reply = '📝 No pending assignments found to draft. Sync Classroom first with /classroom.';
            } else {
              const drafted = await draftClassroomAssignment(list[0].id, 'md');
              reply = `📄 *Draft: ${drafted.filename}*\n\n${drafted.draft}`;
            }
          } else if (/\bgrades?\b/i.test(text)) {
            reply = await handleCommand('/grades', '', chatId);
          } else if (/\bannouncements?\b/i.test(text)) {
            reply = await handleCommand('/announcements', '', chatId);
          } else if (/\bnext\s+exam\b/i.test(text)) {
            reply = await handleCommand('/exams', '', chatId);
          } else if (/\bpending\b/i.test(text)) {
            reply = await handleCommand('/pending', '', chatId);
          } else {
            reply = await handleCommand('/assignments', '', chatId);
          }
        }
        // ── Love Mode detection ──────────────────────────────────────────────
        else if (detectLoveModeDeactivation(text)) {
          await setLoveModeActive(chatId, false);
          reply = `Seri da ❤️ Love Mode off. But whenever you need to talk, I'm here. Take care of yourself. 💙`;
        } else {
          const loveState = await getLoveModeState(chatId);
          const shouldActivate = !loveState.active && detectLoveModeActivation(text);
          if (shouldActivate) {
            await setLoveModeActive(chatId, true);
          }
          const loveModeActive = loveState.active || shouldActivate;
          const aiPrompt = loveModeActive ? `[LOVE_MODE] ${text}` : text;

          const aiRes = await generateAIReply(
            aiPrompt,
            history,
            undefined,
            undefined,
            AbortSignal.timeout(15000)
          );
          pushHistory(chatId, 'user', text);
          pushHistory(chatId, 'assistant', aiRes.reply);
          reply = aiRes.reply;

          if (loveModeActive) {
            await incrementLoveModeMessageCount(chatId);
          }

          if (aiRes.pendingApproval) {
            reply += `\n\n⚠️ *Approval Required*\n${aiRes.pendingApproval.summary}\n\nType \`/approve ${aiRes.pendingApproval.id}\` to confirm or \`/reject ${aiRes.pendingApproval.id}\` to cancel.`;
          }
        }
      }
    }

    await Promise.all([
      reply ? sendTelegramMessage(reply, chatId) : Promise.resolve(false),
      addNotification('telegram', 'Telegram Message', `"${(msg.text || '[media]').slice(0, 60)}"`, 'normal', 'telegram').catch(() => {}),
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
      const ctx = await getGoogleContextForPrompt('calendar events today and tomorrow').catch(() => '');
      await sendTelegramMessage(ctx || '📅 Your calendar schedule is clear (or Google Calendar is not connected).', chatId);
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
    } else {
      await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'OK' });
    }
  } catch (err) {
    logger.warn('Telegram callback error', { err });
    await tgApiCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'Action failed' });
  }
}

export async function telegramWebhook(req: Request, res: Response): Promise<void> {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || config.TELEGRAM_WEBHOOK_SECRET;
  const received = req.header('x-telegram-bot-api-secret-token');

  // Allow if no secret is configured (development)
  if (expected) {
    if (!received) { res.sendStatus(401); return; }
    const exp = Buffer.from(expected);
    const rec = Buffer.from(received);
    if (exp.length !== rec.length || !timingSafeEqual(exp, rec)) {
      res.sendStatus(401);
      return;
    }
  }

  const update: TelegramUpdate = req.body || {};
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

export async function registerTelegramWebhook(webhookUrl: string): Promise<boolean> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || config.TELEGRAM_WEBHOOK_SECRET;
  const body: Record<string, unknown> = { url: webhookUrl };
  if (secret) body.secret_token = secret;
  body.allowed_updates = ['message', 'edited_message', 'callback_query'];
  const result = await tgApiCall('setWebhook', body);
  if (result) {
    telegramState.webhookSet = true;
    await setTelegramCommands();
    logger.info('Telegram webhook registered', { webhookUrl });
    return true;
  }
  return false;
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
      { command: 'drive', description: 'Google Drive status' },
      { command: 'settings', description: 'Karen settings overview' },
      { command: 'love', description: 'Activate Love & Comfort Mode ❤️' },
      { command: 'comfort', description: 'Activate emotional support mode' },
      { command: 'lonely', description: 'I need company right now' },
      { command: 'endlove', description: 'Exit Love Mode, back to normal' },
      { command: 'normal', description: 'Switch back to normal mode' },
      { command: 'insta', description: 'Instagram: /insta send raghul hello' },
      { command: 'classroom', description: 'Google Classroom overview' },
      { command: 'assignments', description: 'Show Classroom assignments' },
      { command: 'pending', description: 'Pending Classroom work' },
      { command: 'grades', description: 'Show Classroom grades' },
      { command: 'exams', description: 'Tracked exam dates' },
      { command: 'examprep', description: 'Last-minute exam preparation' },
    ],
  });
}

export async function getTelegramBotInfo(): Promise<{ username: string; name: string } | null> {
  if (!isConfigured()) return null;
  try {
    const result = await tgApiCall('getMe', {}) as { username?: string; first_name?: string } | null;
    if (result?.username) {
      telegramState.botUsername = result.username;
      return { username: result.username, name: result.first_name || 'Karen' };
    }
  } catch {}
  return null;
}

export { isConfigured as isTelegramConfigured };
