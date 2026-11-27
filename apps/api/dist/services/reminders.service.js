import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { addNotification } from './approval.service.js';
import { logger } from '../config/logger.js';
const memoryReminders = new Map();
export function computeNextOccurrence(currentDueIso, recurrenceRule) {
    if (!recurrenceRule)
        return null;
    const d = new Date(currentDueIso);
    if (Number.isNaN(d.getTime()))
        return null;
    const rule = recurrenceRule.toLowerCase().trim();
    if (rule.includes('daily') || rule.includes('day')) {
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString();
    }
    if (rule.includes('weekly') || rule.includes('week')) {
        d.setUTCDate(d.getUTCDate() + 7);
        return d.toISOString();
    }
    if (rule.includes('monthly') || rule.includes('month')) {
        d.setUTCMonth(d.getUTCMonth() + 1);
        return d.toISOString();
    }
    return null;
}
export async function createReminder(input) {
    const id = crypto.randomUUID();
    const record = {
        id,
        userId: input.userId,
        title: input.title.trim(),
        body: input.body?.trim(),
        timezone: input.timezone || 'Asia/Kolkata',
        dueAt: new Date(input.dueAt).toISOString(),
        recurrenceRule: input.recurrenceRule || null,
        channel: input.channel || 'telegram',
        status: 'scheduled',
        attempts: 0,
        createdAt: new Date().toISOString(),
    };
    memoryReminders.set(id, record);
    await supabaseAdmin
        .from('reminders')
        .insert({
        id,
        user_id: record.userId,
        title: record.title,
        body: record.body || null,
        timezone: record.timezone,
        due_at: record.dueAt,
        recurrence_rule: record.recurrenceRule,
        channel: record.channel,
        status: 'scheduled',
    })
        .then(() => { }, (err) => logger.debug('Reminder DB insert fallback to memory', { err }));
    return record;
}
export async function listReminders(userId) {
    try {
        const { data, error } = await supabaseAdmin
            .from('reminders')
            .select('*')
            .eq('user_id', userId)
            .order('due_at', { ascending: true })
            .limit(50);
        if (!error && Array.isArray(data)) {
            return data.map((r) => ({
                id: r.id,
                userId: r.user_id,
                title: r.title,
                body: r.body || undefined,
                timezone: r.timezone,
                dueAt: r.due_at,
                recurrenceRule: r.recurrence_rule,
                channel: r.channel,
                status: r.status,
                attempts: r.attempts ?? 0,
                lastError: r.last_error,
                deliveredAt: r.delivered_at,
                createdAt: r.created_at,
            }));
        }
    }
    catch {
        // Fall back to memory
    }
    return Array.from(memoryReminders.values()).filter((r) => r.userId === userId);
}
export async function cancelReminder(idOrQuery, userId) {
    const list = await listReminders(userId);
    const q = idOrQuery.trim().toLowerCase();
    const match = list.find((r) => r.status === 'scheduled' && (r.id === idOrQuery || r.title.toLowerCase().includes(q)));
    if (!match)
        return { ok: false };
    match.status = 'cancelled';
    memoryReminders.set(match.id, match);
    await supabaseAdmin
        .from('reminders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', match.id)
        .eq('user_id', userId)
        .then(() => { }, () => { });
    return { ok: true, cancelledTitle: match.title };
}
export async function processDueReminders() {
    const nowIso = new Date().toISOString();
    let dueList = [];
    try {
        const { data } = await supabaseAdmin
            .from('reminders')
            .select('*')
            .eq('status', 'scheduled')
            .lte('due_at', nowIso)
            .limit(20);
        if (Array.isArray(data)) {
            dueList = data.map((r) => ({
                id: r.id,
                userId: r.user_id,
                title: r.title,
                body: r.body || undefined,
                timezone: r.timezone,
                dueAt: r.due_at,
                recurrenceRule: r.recurrence_rule,
                channel: r.channel,
                status: r.status,
                attempts: r.attempts ?? 0,
                createdAt: r.created_at,
            }));
        }
    }
    catch {
        dueList = Array.from(memoryReminders.values()).filter((r) => r.status === 'scheduled' && r.dueAt <= nowIso);
    }
    let sentCount = 0;
    for (const rem of dueList) {
        const istTime = new Date(rem.dueAt).toLocaleString('en-IN', { timeZone: rem.timezone || 'Asia/Kolkata' });
        const msg = `⏰ *Reminder:* ${rem.title}${rem.body ? `\n${rem.body}` : ''}\n🕒 ${istTime} (${rem.timezone})`;
        const ok = await sendTelegramMessage(msg).catch(() => false);
        await addNotification('reminders', `Reminder: ${rem.title}`, rem.body || istTime, 'high', 'worker').catch(() => { });
        const nextDue = computeNextOccurrence(rem.dueAt, rem.recurrenceRule);
        const nextStatus = ok ? (nextDue ? 'scheduled' : 'sent') : rem.attempts >= 2 ? 'failed' : 'scheduled';
        await supabaseAdmin
            .from('reminders')
            .update({
            status: nextStatus,
            due_at: ok && nextDue ? nextDue : rem.dueAt,
            attempts: rem.attempts + 1,
            delivered_at: ok ? new Date().toISOString() : null,
            last_error: ok ? null : 'Telegram delivery failed',
            updated_at: new Date().toISOString(),
        })
            .eq('id', rem.id)
            .then(() => { }, () => { });
        if (ok)
            sentCount++;
    }
    return sentCount;
}
