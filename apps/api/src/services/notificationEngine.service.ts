/**
 * Karen AI – Event-Driven Proactive Notification Engine
 * Pipeline: Integration Event -> Event Bus -> Duplicate Check -> AI Classification
 *           -> Preference & Quiet-Hours Filter -> Persistent Queue -> Telegram Bot
 */

import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { generateAIReply } from './ai.service.js';
import { addNotification } from './approval.service.js';
import { sendTelegramMessage, isTelegramConfigured, type InlineKeyboardButton } from '../providers/telegram.js';
import { logger } from '../config/logger.js';

export type NotificationSource =
  | 'whatsapp'
  | 'instagram'
  | 'gmail'
  | 'calendar'
  | 'drive'
  | 'tasks'
  | 'system'
  | 'files'
  | 'automation';

export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type DeliveryStatus =
  | 'queued'
  | 'delivered'
  | 'failed'
  | 'suppressed_quiet'
  | 'duplicate'
  | 'muted';

export interface IncomingNotificationEvent {
  source: NotificationSource;
  title: string;
  sender?: string;
  body: string;
  timestamp?: string;
  suggestedPriority?: NotificationPriority;
  recommendedAction?: string;
  metadata?: Record<string, string>;
}

export interface NotificationRecord {
  id: string;
  dedupKey: string;
  source: NotificationSource;
  priority: NotificationPriority;
  title: string;
  sender: string;
  summary: string;
  recommendedAction: string;
  timestamp: string;
  status: DeliveryStatus;
  attempts: number;
  isRead: boolean;
  snoozedUntil?: string;
  lastError?: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  useAIClassification: boolean;
  allowedPriorities: NotificationPriority[];
  quietHours: {
    enabled: boolean;
    start: string; // HH:mm in Asia/Kolkata
    end: string;   // HH:mm in Asia/Kolkata
    allowEmergency: boolean; // CRITICAL bypasses quiet hours
  };
  meetingReminderIntervals: number[]; // minutes before event
  dedupWindowMinutes: number;
  sources: Record<NotificationSource, boolean>;
  mutedSources: NotificationSource[];
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  useAIClassification: true,
  allowedPriorities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
  quietHours: {
    enabled: false,
    start: '22:30',
    end: '07:00',
    allowEmergency: true,
  },
  meetingReminderIntervals: [15, 30],
  dedupWindowMinutes: 10,
  sources: {
    whatsapp: true,
    instagram: true,
    gmail: true,
    calendar: true,
    drive: true,
    tasks: true,
    system: true,
    files: true,
    automation: true,
  },
  mutedSources: [],
};

const bus = new EventEmitter();
let preferences: NotificationPreferences = structuredClone(DEFAULT_PREFERENCES);
const historyStore: NotificationRecord[] = [];
const dedupCache = new Map<string, number>();

export function getNotificationPreferences(): NotificationPreferences {
  return structuredClone(preferences);
}

export function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>
): NotificationPreferences {
  preferences = {
    ...preferences,
    ...patch,
    quietHours: patch.quietHours
      ? { ...preferences.quietHours, ...patch.quietHours }
      : preferences.quietHours,
    sources: patch.sources
      ? { ...preferences.sources, ...patch.sources }
      : preferences.sources,
  };
  return getNotificationPreferences();
}

export function resetNotificationEngineForTests(): void {
  preferences = structuredClone(DEFAULT_PREFERENCES);
  historyStore.length = 0;
  dedupCache.clear();
}

export function computeDedupKey(event: IncomingNotificationEvent): string {
  const raw = `${event.source}|${event.sender || ''}|${event.title}|${event.body.slice(0, 100)}`.toLowerCase();
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function isDuplicateEvent(dedupKey: string, nowMs = Date.now()): boolean {
  const windowMs = preferences.dedupWindowMinutes * 60 * 1000;
  const lastSeen = dedupCache.get(dedupKey);
  if (lastSeen && nowMs - lastSeen < windowMs) {
    return true;
  }
  dedupCache.set(dedupKey, nowMs);
  return false;
}

export function getIstMinutesOfDay(date = new Date()): number {
  const istStr = date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [h, m] = istStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isInsideQuietHours(date = new Date()): boolean {
  if (!preferences.quietHours.enabled) return false;
  const nowMin = getIstMinutesOfDay(date);
  const startMin = parseHHMM(preferences.quietHours.start);
  const endMin = parseHHMM(preferences.quietHours.end);

  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Overnight window (e.g. 22:30 -> 07:00)
  return nowMin >= startMin || nowMin < endMin;
}

function heuristicClassify(event: IncomingNotificationEvent): {
  priority: NotificationPriority;
  summary: string;
  recommendedAction: string;
} {
  if (event.suggestedPriority) {
    return {
      priority: event.suggestedPriority,
      summary: event.body.slice(0, 280),
      recommendedAction: event.recommendedAction || 'Review when convenient.',
    };
  }

  const combined = `${event.title} ${event.body}`.toLowerCase();
  if (/\b(otp|unauthorized|breach|security alert|critical|failed|down|crash|urgent|emergency|asap|deadline today)\b/.test(combined)) {
    return {
      priority: 'CRITICAL',
      summary: event.body.slice(0, 280),
      recommendedAction: event.recommendedAction || 'Immediate attention recommended.',
    };
  }
  if (/\b(invoice|payment|meeting|interview|client|important|deadline|reminder)\b/.test(combined) || event.source === 'calendar') {
    return {
      priority: 'HIGH',
      summary: event.body.slice(0, 280),
      recommendedAction: event.recommendedAction || 'Check details and respond.',
    };
  }
  if (event.source === 'instagram' || event.source === 'tasks' || event.source === 'files') {
    return {
      priority: 'MEDIUM',
      summary: event.body.slice(0, 280),
      recommendedAction: event.recommendedAction || 'Review update.',
    };
  }
  return {
    priority: 'LOW',
    summary: event.body.slice(0, 280),
    recommendedAction: event.recommendedAction || 'For your information.',
  };
}

async function classifyAndSummarizeEvent(event: IncomingNotificationEvent): Promise<{
  priority: NotificationPriority;
  summary: string;
  recommendedAction: string;
}> {
  const baseline = heuristicClassify(event);
  if (!preferences.useAIClassification || event.suggestedPriority) {
    return baseline;
  }

  try {
    const prompt = `Classify this incoming notification for Hari. Return ONLY valid JSON with keys: priority ("CRITICAL" | "HIGH" | "MEDIUM" | "LOW"), summary (max 180 chars, never invent facts), recommendedAction (max 80 chars).
Rules:
- Do NOT classify routine updates as CRITICAL or HIGH.
- CRITICAL is only for security alerts, urgent personal messages, or system failures.
Source: ${event.source}
Sender/Event: ${event.sender || event.title}
Title: ${event.title}
Body: ${event.body.slice(0, 800)}`;

    const aiRes = await generateAIReply(prompt, []);
    const match = aiRes.reply.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as {
        priority?: string;
        summary?: string;
        recommendedAction?: string;
      };
      const validPriorities: NotificationPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      const priority = validPriorities.includes(parsed.priority as NotificationPriority)
        ? (parsed.priority as NotificationPriority)
        : baseline.priority;
      return {
        priority,
        summary: (parsed.summary || baseline.summary).slice(0, 280),
        recommendedAction: (parsed.recommendedAction || baseline.recommendedAction).slice(0, 120),
      };
    }
  } catch {
    // Fall back to heuristic classification if AI is unavailable
  }
  return baseline;
}

function formatTelegramNotification(record: NotificationRecord): string {
  const badge: Record<NotificationPriority, string> = {
    CRITICAL: '🚨 CRITICAL',
    HIGH: '🔴 HIGH',
    MEDIUM: '🟡 MEDIUM',
    LOW: '🟢 LOW',
  };

  const istTime = new Date(record.timestamp).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return [
    `*KAREN PROACTIVE ALERT*`,
    `Priority: *${badge[record.priority]}*`,
    `Source: *${record.source.toUpperCase()}*`,
    `From / Event: *${record.sender || record.title}*`,
    ``,
    `${record.summary}`,
    ``,
    `Action: _${record.recommendedAction}_`,
    `Time: ${istTime} IST`,
  ].join('\n');
}

function buildNotificationButtons(record: NotificationRecord): InlineKeyboardButton[][] {
  return [
    [
      { text: '✅ Mark as read', callback_data: `notif_read:${record.id}` },
      { text: '⏰ Remind later', callback_data: `notif_snooze:${record.id}` },
    ],
    [
      { text: '📋 View details', callback_data: `notif_details:${record.id}` },
      { text: '🔇 Mute similar', callback_data: `notif_mute:${record.source}` },
    ],
  ];
}

async function deliverWithRetry(record: NotificationRecord, maxAttempts = 3): Promise<boolean> {
  const text = formatTelegramNotification(record);
  const inlineKeyboard = buildNotificationButtons(record);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    record.attempts = attempt;
    try {
      const ok = await sendTelegramMessage(text, undefined, {
        inlineKeyboard,
      });
      if (ok) {
        record.status = 'delivered';
        record.lastError = undefined;
        return true;
      }
      record.lastError = 'Telegram send returned false';
    } catch (err) {
      record.lastError = err instanceof Error ? err.message : 'Telegram delivery error';
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  record.status = 'failed';
  return false;
}

export async function processNotificationEvent(
  event: IncomingNotificationEvent
): Promise<NotificationRecord> {
  const nowIso = event.timestamp || new Date().toISOString();
  const dedupKey = computeDedupKey(event);
  const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const record: NotificationRecord = {
    id,
    dedupKey,
    source: event.source,
    priority: event.suggestedPriority || 'MEDIUM',
    title: event.title,
    sender: event.sender || event.title,
    summary: event.body.slice(0, 280),
    recommendedAction: event.recommendedAction || 'Review update.',
    timestamp: nowIso,
    status: 'queued',
    attempts: 0,
    isRead: false,
  };

  if (!preferences.enabled || !preferences.sources[event.source] || preferences.mutedSources.includes(event.source)) {
    record.status = 'muted';
    historyStore.unshift(record);
    return record;
  }

  if (isDuplicateEvent(dedupKey)) {
    record.status = 'duplicate';
    historyStore.unshift(record);
    return record;
  }

  const classified = await classifyAndSummarizeEvent(event);
  record.priority = classified.priority;
  record.summary = classified.summary;
  record.recommendedAction = classified.recommendedAction;

  if (!preferences.allowedPriorities.includes(record.priority)) {
    record.status = 'muted';
    historyStore.unshift(record);
    return record;
  }

  const quiet = isInsideQuietHours(new Date(nowIso));
  if (quiet && !(record.priority === 'CRITICAL' && preferences.quietHours.allowEmergency)) {
    record.status = 'suppressed_quiet';
    historyStore.unshift(record);
    return record;
  }

  // Persist to main Karen notification log
  const mappedPriority = record.priority === 'CRITICAL' ? 'critical' : record.priority === 'HIGH' ? 'high' : record.priority === 'LOW' ? 'low' : 'normal';
  await addNotification(event.source, record.title, record.summary, mappedPriority, 'telegram').catch(() => {});

  if (isTelegramConfigured()) {
    await deliverWithRetry(record);
  } else {
    record.status = 'failed';
    record.lastError = 'TELEGRAM_BOT_TOKEN not configured';
  }

  historyStore.unshift(record);
  if (historyStore.length > 200) historyStore.length = 200;
  return record;
}

bus.on('notify', (event: IncomingNotificationEvent) => {
  void processNotificationEvent(event).catch((err) => {
    logger.error('Notification engine event error', { err });
  });
});

export function emitNotificationEvent(event: IncomingNotificationEvent): void {
  bus.emit('notify', event);
}

export function listNotificationHistory(priorityFilter?: NotificationPriority): NotificationRecord[] {
  if (!priorityFilter) return [...historyStore];
  return historyStore.filter((n) => n.priority === priorityFilter);
}

export function getNotificationStats() {
  return {
    total: historyStore.length,
    critical: historyStore.filter((n) => n.priority === 'CRITICAL').length,
    unread: historyStore.filter((n) => !n.isRead).length,
    delivered: historyStore.filter((n) => n.status === 'delivered').length,
    failures: historyStore.filter((n) => n.status === 'failed').length,
    suppressedQuiet: historyStore.filter((n) => n.status === 'suppressed_quiet').length,
    duplicatesBlocked: historyStore.filter((n) => n.status === 'duplicate').length,
  };
}

export function markNotificationRead(id: string): NotificationRecord | null {
  const item = historyStore.find((n) => n.id === id);
  if (!item) return null;
  item.isRead = true;
  return item;
}

export function snoozeNotification(id: string, minutes = 30): NotificationRecord | null {
  const item = historyStore.find((n) => n.id === id);
  if (!item) return null;
  item.snoozedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  return item;
}

export function muteNotificationSource(source: NotificationSource): NotificationPreferences {
  if (!preferences.mutedSources.includes(source)) {
    preferences.mutedSources.push(source);
  }
  preferences.sources[source] = false;
  return getNotificationPreferences();
}

export function getNotificationById(id: string): NotificationRecord | null {
  return historyStore.find((n) => n.id === id) || null;
}

export async function retryFailedNotifications(): Promise<{ retried: number; succeeded: number }> {
  const failed = historyStore.filter((n) => n.status === 'failed');
  let succeeded = 0;
  for (const item of failed) {
    const ok = await deliverWithRetry(item, 2);
    if (ok) succeeded++;
  }
  return { retried: failed.length, succeeded };
}

export async function syncAndNotifyLiveWorkspaceAlerts(options?: {
  forceSummary?: boolean;
}): Promise<{ alertsSent: number; checkedTasks: number; checkedEvents: number }> {
  if (!isTelegramConfigured()) {
    return { alertsSent: 0, checkedTasks: 0, checkedEvents: 0 };
  }

  const [{ hydrateGoogleTokensFromRequest }, { listCalendarEvents, listGoogleTasks }, { loadUserSetting, saveUserSetting }] =
    await Promise.all([
      import('../routes/googleDrive.js'),
      import('./googleWorkspace.service.js'),
      import('./persistence.service.js'),
    ]);

  await hydrateGoogleTokensFromRequest().catch(() => {});

  const nowMs = Date.now();
  const todayIst = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const [gTasksRes, calRes, sentCacheRaw] = await Promise.all([
    listGoogleTasks().catch(() => ({ ok: false, tasks: [] })),
    listCalendarEvents(2).catch(() => ({ ok: false, events: [] })),
    loadUserSetting<Record<string, number>>('workspace_live_alerts_sent_v1').catch(() => null),
  ]);

  const sentMap: Record<string, number> =
    sentCacheRaw && typeof sentCacheRaw === 'object' ? { ...sentCacheRaw } : {};
  // Prune dedup entries older than 36h
  for (const [k, ts] of Object.entries(sentMap)) {
    if (typeof ts !== 'number' || nowMs - ts > 36 * 60 * 60 * 1000) {
      delete sentMap[k];
    }
  }

  let alertsSent = 0;

  // 1. Live Google Tasks due today or overdue
  const tasks = gTasksRes.ok ? gTasksRes.tasks : [];
  for (const task of tasks) {
    if (task.status === 'completed') continue;
    const dueIso = task.due ? String(task.due).slice(0, 10) : '';
    if (!dueIso || dueIso > todayIst) continue;

    const dedupKey = `gtask:${task.id}:${todayIst}`;
    if (!options?.forceSummary && sentMap[dedupKey]) continue;

    const isOverdue = dueIso < todayIst;
    const msg = isOverdue
      ? `⚠️ *Live Google Task Overdue*\n\n• *${task.title}*\n• Due was: ${dueIso}\n\nTap below once completed:`
      : `📋 *Live Google Task Due TODAY (${todayIst})*\n\n• *${task.title}*\n\nStay on track today!`;

    const ok = await sendTelegramMessage(msg, undefined, {
      inlineKeyboard: [
        [
          { text: '✅ Done', callback_data: `task_done:gtask:${task.id}` },
          { text: '📆 Snooze +1d', callback_data: `task_snooze:gtask:${task.id}` },
        ],
      ],
    });
    if (ok) {
      sentMap[dedupKey] = nowMs;
      alertsSent++;
    }
  }

  // 2. Live Google Calendar upcoming events (within next 45 min, or today agenda if forceSummary)
  const events = calRes.ok ? calRes.events : [];
  for (const ev of events) {
    const startMs = ev.start ? new Date(ev.start).getTime() : NaN;
    if (Number.isNaN(startMs)) continue;
    const diffMin = Math.round((startMs - nowMs) / 60000);
    const evIst = new Date(startMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const isSoon = diffMin >= 0 && diffMin <= 45;
    const isTodayForced = Boolean(options?.forceSummary && evIst === todayIst && diffMin >= -10);
    if (!isSoon && !isTodayForced) continue;

    const dedupKey = `gcal:${ev.id}:${evIst}`;
    if (!options?.forceSummary && sentMap[dedupKey]) continue;

    const timeIst = new Date(startMs).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    });
    const msg =
      `📅 *Google Calendar Alert*\n\n` +
      `• *${ev.summary}*\n` +
      `• 🕒 ${timeIst} IST (${diffMin > 0 ? `in ~${diffMin} mins` : 'starting now'})` +
      `${ev.location ? `\n• 📍 ${ev.location}` : ''}`;

    const ok = await sendTelegramMessage(
      msg,
      undefined,
      ev.htmlLink ? { inlineKeyboard: [[{ text: 'Open Calendar', url: ev.htmlLink }]] } : undefined
    );
    if (ok) {
      sentMap[dedupKey] = nowMs;
      alertsSent++;
    }
  }

  if (alertsSent > 0) {
    await saveUserSetting('workspace_live_alerts_sent_v1', sentMap).catch(() => {});
  }

  return { alertsSent, checkedTasks: tasks.length, checkedEvents: events.length };
}
