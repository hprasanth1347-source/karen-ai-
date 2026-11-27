/**
 * Karen AI – Personal Daily Companion & Smart Greeting System
 * Sends proactive AI-personalized greetings in Asia/Kolkata timezone:
 *   Morning   (07:00 IST) -> "Good morning! ☀️"
 *   Afternoon (13:00 IST) -> "Good afternoon! 🌤️"
 *   Evening   (18:00 IST) -> "Good evening! 🌇"
 *   Night     (21:30 IST) -> "Good night! 🌙"
 * Includes duplicate prevention, adaptive empty-state messaging,
 * real task/calendar/email/notification grounding, and Telegram inline buttons.
 */
import { generateAIReply } from './ai.service.js';
import { addNotification } from './approval.service.js';
import { listTasks } from './task.service.js';
import { getMemoryContextPrompt } from './memory.service.js';
import { instagramAutoReplyService } from './instagramAutoReply.js';
import { getGoogleContextForPrompt, hydrateGoogleTokensFromRequest } from '../routes/googleDrive.js';
import { getNotificationStats, isInsideQuietHours } from './notificationEngine.service.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { logger } from '../config/logger.js';
const DEFAULT_COMPANION_CONFIG = {
    enabled: true,
    language: 'mixed',
    respectQuietHours: true,
    weatherEnabled: false,
    calendarReminderMinutes: [15, 30],
    slots: {
        morning: { enabled: true, time: '07:00' },
        afternoon: { enabled: true, time: '13:00' },
        evening: { enabled: true, time: '18:00' },
        night: { enabled: true, time: '21:30' },
    },
};
let companionConfig = structuredClone(DEFAULT_COMPANION_CONFIG);
const sentGreetingKeys = new Set();
const greetingHistory = [];
let schedulerTimer = null;
export function getCompanionConfig() {
    return structuredClone(companionConfig);
}
export function updateCompanionConfig(patch) {
    companionConfig = {
        ...companionConfig,
        ...patch,
        slots: patch.slots
            ? {
                morning: { ...companionConfig.slots.morning, ...patch.slots.morning },
                afternoon: { ...companionConfig.slots.afternoon, ...patch.slots.afternoon },
                evening: { ...companionConfig.slots.evening, ...patch.slots.evening },
                night: { ...companionConfig.slots.night, ...patch.slots.night },
            }
            : companionConfig.slots,
    };
    return getCompanionConfig();
}
export function getGreetingHistory() {
    return [...greetingHistory];
}
export function resetCompanionForTests() {
    companionConfig = structuredClone(DEFAULT_COMPANION_CONFIG);
    sentGreetingKeys.clear();
    greetingHistory.length = 0;
}
export function getIstDateAndTime(date = new Date()) {
    const dateIso = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const hhmm = date.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    });
    const readableDate = date.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const [h, m] = hhmm.split(':').map(Number);
    return {
        dateIso,
        hhmm,
        readableDate,
        minutesOfDay: (h || 0) * 60 + (m || 0),
    };
}
const SLOT_HEADERS = {
    morning: 'Good morning! ☀️',
    afternoon: 'Good afternoon! 🌤️',
    evening: 'Good evening! 🌇',
    night: 'Good night! 🌙',
};
export async function generateAndSendGreeting(slot, options) {
    const now = options?.now || new Date();
    const { dateIso, readableDate } = getIstDateAndTime(now);
    const dedupKey = `${dateIso}:${slot}`;
    if (!options?.force) {
        if (!companionConfig.enabled || !companionConfig.slots[slot].enabled) {
            return { sent: false, skippedReason: 'slot_disabled' };
        }
        if (sentGreetingKeys.has(dedupKey)) {
            return { sent: false, skippedReason: 'duplicate_prevented' };
        }
        if (companionConfig.respectQuietHours && isInsideQuietHours(now)) {
            return { sent: false, skippedReason: 'quiet_hours' };
        }
    }
    await hydrateGoogleTokensFromRequest().catch(() => { });
    const [tasks, igLogs, emailContext, memoryContext] = await Promise.all([
        listTasks(),
        instagramAutoReplyService.getLogs(),
        getGoogleContextForPrompt('important emails and calendar events').catch(() => ''),
        getMemoryContextPrompt().catch(() => ''),
    ]);
    const completedToday = tasks.filter((t) => t.status === 'done');
    const pendingTasks = tasks.filter((t) => t.status !== 'done');
    const overdueTasks = pendingTasks.filter((t) => t.due && t.due < dateIso);
    const todayTasks = pendingTasks.filter((t) => !t.due || t.due === dateIso);
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowIso = getIstDateAndTime(tomorrowDate).dateIso;
    const tomorrowTasks = pendingTasks.filter((t) => t.due === tomorrowIso);
    const notifStats = getNotificationStats();
    const taskSummary = pendingTasks.length === 0
        ? 'No pending tasks.'
        : pendingTasks
            .slice(0, 8)
            .map((t) => `- [${t.priority.toUpperCase()}] ${t.title} (due: ${t.due || 'today'})`)
            .join('\n');
    const overdueSummary = overdueTasks.length === 0
        ? 'None.'
        : overdueTasks.map((t) => `- ${t.title} (was due ${t.due})`).join('\n');
    const tomorrowSummary = tomorrowTasks.length === 0
        ? 'No tasks scheduled for tomorrow yet.'
        : tomorrowTasks.map((t) => `- ${t.title}`).join('\n');
    const langRule = companionConfig.language === 'english'
        ? 'Write in warm, concise English.'
        : companionConfig.language === 'tanglish'
            ? 'Write in natural, friendly Tanglish (Tamil + English).'
            : 'Write in warm English with light natural Tanglish touches.';
    const prompt = `Generate a concise, personalized ${slot} greeting for Hari.
Start with exact header: "${SLOT_HEADERS[slot]}"
Today (IST): ${readableDate} (${dateIso})
${langRule}

STRICT GROUNDING RULES:
- NEVER invent tasks, meetings, emails, or events.
- If Pending Tasks says "No pending tasks.", state clearly that there are no pending tasks.
- If no calendar/email data is connected below, state that the calendar schedule is clear / not connected.
- Highlight overdue tasks politely if any exist.
- Keep it concise, conversational, and formatted cleanly for Telegram.

Real Context:
- Completed Tasks Count: ${completedToday.length}
- Today's Tasks Count: ${todayTasks.length}
- Pending Tasks:
${taskSummary}
- Overdue Tasks:
${overdueSummary}
- Tomorrow's Tasks:
${tomorrowSummary}
- Unread Proactive Alerts: ${notifStats.unread} (Critical: ${notifStats.critical})
- Recent Instagram Activity: ${igLogs.length} recent logs
- Google Calendar & Email Context: ${emailContext || 'Not connected / schedule clear.'}
${memoryContext}`;
    let messageText = `${SLOT_HEADERS[slot]}\n📅 ${readableDate}\n\n`;
    try {
        const aiRes = await generateAIReply(prompt, []);
        messageText = aiRes.reply.startsWith(SLOT_HEADERS[slot])
            ? aiRes.reply
            : `${SLOT_HEADERS[slot]}\n\n${aiRes.reply}`;
    }
    catch {
        messageText +=
            pendingTasks.length === 0
                ? 'You have no pending tasks right now, and your schedule is clear.'
                : `You have ${pendingTasks.length} pending task(s):\n${taskSummary}`;
    }
    const inlineKeyboard = [
        [
            { text: '📋 Today’s Tasks', callback_data: 'comp_tasks' },
            { text: '📅 Calendar', callback_data: 'comp_calendar' },
        ],
        [
            { text: '🔔 Notifications', callback_data: 'comp_notifs' },
            { text: '📆 Tomorrow', callback_data: 'comp_tomorrow' },
        ],
    ];
    if (pendingTasks.length > 0) {
        inlineKeyboard.push([
            {
                text: `✅ Done: ${pendingTasks[0].title.slice(0, 22)}`,
                callback_data: `task_done:${pendingTasks[0].id}`,
            },
            {
                text: '⏰ Snooze task',
                callback_data: `task_snooze:${pendingTasks[0].id}`,
            },
        ]);
    }
    const deliveredToTelegram = await sendTelegramMessage(messageText, undefined, {
        inlineKeyboard,
    });
    sentGreetingKeys.add(dedupKey);
    await addNotification('companion_greeting', `${SLOT_HEADERS[slot]}`, messageText.slice(0, 220), 'normal', 'telegram').catch(() => { });
    const entry = {
        key: dedupKey,
        slot,
        sentAt: now.toISOString(),
        deliveredToTelegram,
        preview: messageText.slice(0, 160),
    };
    greetingHistory.unshift(entry);
    if (greetingHistory.length > 50)
        greetingHistory.length = 50;
    return { sent: true, entry };
}
function parseMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
/**
 * Evaluates current IST time and sends any due greeting within a 15-minute window.
 * Idempotent: safe to call from a 60s interval or cloud cron endpoint.
 */
export async function runCompanionTick(now = new Date()) {
    const { hhmm, minutesOfDay } = getIstDateAndTime(now);
    const triggered = [];
    const slots = ['morning', 'afternoon', 'evening', 'night'];
    for (const slot of slots) {
        const cfg = companionConfig.slots[slot];
        if (!cfg.enabled)
            continue;
        const targetMin = parseMinutes(cfg.time);
        const diff = minutesOfDay - targetMin;
        if (diff >= 0 && diff <= 15) {
            const res = await generateAndSendGreeting(slot, { now });
            if (res.sent)
                triggered.push(slot);
        }
    }
    return { checkedAtIst: hhmm, triggered };
}
export function startCompanionScheduler() {
    if (schedulerTimer || process.env.VERCEL)
        return;
    schedulerTimer = setInterval(() => {
        void runCompanionTick().catch((err) => {
            logger.error('Companion scheduler tick failed', { err });
        });
    }, 60_000);
    schedulerTimer.unref?.();
    logger.info('Karen Daily Companion scheduler started (Asia/Kolkata)');
}
export function stopCompanionScheduler() {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}
