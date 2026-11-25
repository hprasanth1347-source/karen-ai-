import { Router } from 'express';
import { generateAIReply } from '../services/ai.service.js';
import { addNotification } from '../services/approval.service.js';
import { listTasks } from '../services/task.service.js';
import { instagramAutoReplyService } from '../services/instagramAutoReply.js';
import { getGoogleContextForPrompt, hydrateGoogleTokensFromRequest } from './googleDrive.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import {
  generateAndSendGreeting,
  runCompanionTick,
  type GreetingSlot,
} from '../services/dailyCompanion.service.js';
import { success, error } from '../utils/response.js';

const router = Router();

async function runMorningBriefing() {
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

  const prompt = `Generate a concise Morning Briefing for Hari (in clear English bullet points):
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

router.get('/cron/morning-briefing', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.header('authorization') !== `Bearer ${cronSecret}`) {
    return error(res, 'Unauthorized cron invocation', 401, 'UNAUTHORIZED');
  }
  try {
    const result = await runMorningBriefing();
    return success(res, result);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Morning briefing failed', 500);
  }
});

router.post('/cron/morning-briefing', async (_req, res) => {
  try {
    const result = await runMorningBriefing();
    return success(res, result);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Morning briefing failed', 500);
  }
});

/** Evaluate IST time and send any due Daily Companion greeting (idempotent) */
router.get('/cron/companion-tick', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.header('authorization') !== `Bearer ${cronSecret}`) {
    return error(res, 'Unauthorized cron invocation', 401, 'UNAUTHORIZED');
  }
  try {
    const result = await runCompanionTick();
    return success(res, result);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Companion tick failed', 500);
  }
});

router.post('/cron/companion-tick', async (_req, res) => {
  try {
    const result = await runCompanionTick();
    return success(res, result);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Companion tick failed', 500);
  }
});

router.post('/cron/greeting/:slot', async (req, res) => {
  const slot = String(req.params.slot) as GreetingSlot;
  if (!['morning', 'afternoon', 'evening', 'night'].includes(slot)) {
    return error(res, 'Invalid greeting slot', 400);
  }
  try {
    const result = await generateAndSendGreeting(slot, { force: Boolean(req.body?.force) });
    return success(res, result);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Greeting trigger failed', 500);
  }
});

export default router;
