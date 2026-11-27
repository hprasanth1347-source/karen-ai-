import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { generateAIReply } from '../services/ai.service.js';
import { addNotification } from '../services/approval.service.js';
import { listTasks } from '../services/task.service.js';
import { instagramAutoReplyService } from '../services/instagramAutoReply.js';
import { getGoogleContextForPrompt, hydrateGoogleTokensFromRequest } from './googleDrive.js';
import { syncAndNotifyLiveWorkspaceAlerts } from '../services/notificationEngine.service.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { generateAndSendGreeting, runCompanionTick, } from '../services/dailyCompanion.service.js';
import { syncClassroomData } from '../services/classroom.service.js';
import { purgeOldGeneratedSkillFiles } from '../skills/storage.js';
import { loadInstagramTokensWithStatus, markInstagramNeedsReauth, saveInstagramTokensToDb, } from '../services/persistence.service.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { success, error } from '../utils/response.js';
const router = Router();
function verifyCronSecret(req, res, next) {
    const cronSecret = config.CRON_SECRET || process.env.CRON_SECRET;
    if (!cronSecret) {
        return error(res, 'CRON_SECRET is not configured', 401, 'UNAUTHORIZED');
    }
    const authHeader = req.header('authorization') || '';
    const expected = `Bearer ${cronSecret}`;
    const a = Buffer.from(authHeader, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return error(res, 'Unauthorized cron invocation', 401, 'UNAUTHORIZED');
    }
    return next();
}
export async function refreshMetaTokenIfNeeded() {
    const { tokens, status } = await loadInstagramTokensWithStatus();
    if (!tokens || status !== 'connected') {
        return { refreshed: false, status };
    }
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (tokens.expiresAt && Date.now() < tokens.expiresAt - sevenDaysMs) {
        return { refreshed: false, status: 'valid' };
    }
    try {
        const params = new URLSearchParams({
            grant_type: 'ig_refresh_token',
            access_token: tokens.accessToken,
        });
        const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params.toString()}`, {
            signal: AbortSignal.timeout(8000),
        });
        const json = (await res.json().catch(() => ({})));
        if (res.ok && json.access_token) {
            await saveInstagramTokensToDb({
                ...tokens,
                accessToken: json.access_token,
                expiresAt: Date.now() + (Number(json.expires_in) || 5184000) * 1000,
            });
            return { refreshed: true, status: 'connected' };
        }
        if (res.status === 400 || res.status === 401) {
            await markInstagramNeedsReauth();
            await sendTelegramMessage('⚠️ *Karen Meta Alert*\n\nInstagram token refresh failed and needs re-authorization. Please reconnect on `/instagram`.').catch(() => { });
            return { refreshed: false, status: 'needs_reauth' };
        }
        return { refreshed: false, status: 'transient_error' };
    }
    catch {
        return { refreshed: false, status: 'transient_error' };
    }
}
async function runMorningBriefing() {
    await refreshMetaTokenIfNeeded().catch(() => { });
    await hydrateGoogleTokensFromRequest();
    const [tasks, igLogs, emailContext] = await Promise.all([
        listTasks(),
        instagramAutoReplyService.getLogs(),
        getGoogleContextForPrompt('important emails'),
    ]);
    const activeTasks = tasks.filter((t) => t.status !== 'done');
    const taskLines = activeTasks.length
        ? activeTasks.map((t) => `- [${t.priority}] ${t.title} (due ${t.due || 'today'})`).join('\n')
        : 'No pending tasks.';
    const igLines = igLogs.length
        ? igLogs.slice(0, 5).map((l) => `- @${l.senderUsername}: "${l.incomingText}" -> ${l.status}`).join('\n')
        : 'No recent Instagram auto-replies.';
    const prompt = `Generate a concise Morning Briefing for the owner (in clear English bullet points):
Active Tasks:
${taskLines}

Recent Instagram DM Auto-Replies:
${igLines}
${emailContext || '\nNo Gmail context connected.'}`;
    const aiRes = await generateAIReply(prompt, []);
    await addNotification('ai_message', 'Daily Morning Briefing', aiRes.reply, 'high', 'web');
    const sentToTelegram = await sendTelegramMessage(`☀️ Karen Morning Briefing\n\n${aiRes.reply}`);
    return { briefing: aiRes.reply, sentToTelegram };
}
router.get('/cron/morning-briefing', verifyCronSecret, async (_req, res) => {
    try {
        const result = await runMorningBriefing();
        return success(res, result);
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Morning briefing failed', 500);
    }
});
router.post('/cron/morning-briefing', verifyCronSecret, async (_req, res) => {
    try {
        const result = await runMorningBriefing();
        return success(res, result);
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Morning briefing failed', 500);
    }
});
/** Evaluate IST time and send any due Daily Companion greeting + live Workspace alerts (idempotent) */
router.get('/cron/companion-tick', verifyCronSecret, async (_req, res) => {
    try {
        const [result, liveAlerts] = await Promise.all([
            runCompanionTick(),
            syncAndNotifyLiveWorkspaceAlerts().catch(() => ({ alertsSent: 0, checkedTasks: 0, checkedEvents: 0 })),
        ]);
        return success(res, { ...result, liveAlerts });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Companion tick failed', 500);
    }
});
router.post('/cron/companion-tick', verifyCronSecret, async (_req, res) => {
    try {
        const [result, liveAlerts] = await Promise.all([
            runCompanionTick(),
            syncAndNotifyLiveWorkspaceAlerts().catch(() => ({ alertsSent: 0, checkedTasks: 0, checkedEvents: 0 })),
        ]);
        return success(res, { ...result, liveAlerts });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Companion tick failed', 500);
    }
});
router.post('/cron/greeting/:slot', verifyCronSecret, requireAuth, requireOwner, async (req, res) => {
    const slot = String(req.params.slot);
    if (!['morning', 'afternoon', 'evening', 'night'].includes(slot)) {
        return error(res, 'Invalid greeting slot', 400);
    }
    try {
        const result = await generateAndSendGreeting(slot, { force: Boolean(req.body?.force) });
        return success(res, result);
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Greeting trigger failed', 500);
    }
});
router.get('/cron/classroom-sync', verifyCronSecret, async (_req, res) => {
    try {
        const result = await syncClassroomData();
        return success(res, {
            synced: result.synced,
            notificationsSent: result.notificationsSent,
            lastSyncedAt: result.cache.lastSyncedAt,
        });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Classroom sync failed', 500);
    }
});
router.post('/cron/classroom-sync', verifyCronSecret, async (_req, res) => {
    try {
        const result = await syncClassroomData();
        return success(res, {
            synced: result.synced,
            notificationsSent: result.notificationsSent,
            lastSyncedAt: result.cache.lastSyncedAt,
        });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Classroom sync failed', 500);
    }
});
router.get('/cron/meta-token-refresh', verifyCronSecret, async (_req, res) => {
    const result = await refreshMetaTokenIfNeeded();
    const purgedRuns = await purgeOldGeneratedSkillFiles().catch(() => 0);
    return success(res, { ...result, purgedRuns });
});
router.post('/cron/meta-token-refresh', verifyCronSecret, async (_req, res) => {
    const result = await refreshMetaTokenIfNeeded();
    const purgedRuns = await purgeOldGeneratedSkillFiles().catch(() => 0);
    return success(res, { ...result, purgedRuns });
});
/** 24/7 Headless Instagram Auto-DM Poller (for Uptime / Cron pings when owner is offline) */
router.get('/cron/instagram-poll', verifyCronSecret, async (_req, res) => {
    try {
        const repliesSent = await instagramAutoReplyService.scanAndAutoReply();
        return success(res, { ok: true, repliesSent, checkedAt: new Date().toISOString() });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Instagram poll failed', 500);
    }
});
router.post('/cron/instagram-poll', verifyCronSecret, async (_req, res) => {
    try {
        const repliesSent = await instagramAutoReplyService.scanAndAutoReply();
        return success(res, { ok: true, repliesSent, checkedAt: new Date().toISOString() });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Instagram poll failed', 500);
    }
});
router.post('/cron/reminders', verifyCronSecret, async (_req, res) => {
    const { processDueReminders } = await import('../services/reminders.service.js');
    const processed = await processDueReminders();
    return success(res, { processed });
});
router.post('/cron/newsroom', verifyCronSecret, async (_req, res) => {
    const { getNewsroomConfig, generateDailyEditions, deliverEditionToTelegram } = await import('../services/newsroom.service.js');
    const cfg = getNewsroomConfig();
    if (cfg.paused)
        return success(res, { skipped: true, reason: 'paused' });
    const editions = await generateDailyEditions();
    let delivered = false;
    if (cfg.mode === 'AUTOMATIC') {
        const enOk = await deliverEditionToTelegram(editions.en);
        const taOk = await deliverEditionToTelegram(editions.ta);
        delivered = enOk || taOk;
    }
    return success(res, { generated: true, mode: cfg.mode, delivered });
});
export default router;
