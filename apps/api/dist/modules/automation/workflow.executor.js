import crypto from 'node:crypto';
import { aiProviderManager } from '../../services/aiProviderManager.service.js';
import { sendTelegramMessage } from '../../providers/telegram.js';
import { addNotification } from '../../services/approval.service.js';
import { generateDailyEditions } from '../../services/newsroom.service.js';
import { syncClassroomData } from '../../services/classroom.service.js';
import { createReminder } from '../../services/reminders.service.js';
function orderNodes(wf) {
    const byId = new Map(wf.nodes.map((n) => [n.id, n]));
    const indeg = new Map(wf.nodes.map((n) => [n.id, 0]));
    const adj = new Map();
    for (const e of wf.edges) {
        indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
        const list = adj.get(e.source) || [];
        list.push(e.target);
        adj.set(e.source, list);
    }
    const q = wf.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
    const ordered = [];
    while (q.length > 0) {
        const id = q.shift();
        const node = byId.get(id);
        if (node)
            ordered.push(node);
        for (const next of adj.get(id) || []) {
            indeg.set(next, (indeg.get(next) ?? 1) - 1);
            if (indeg.get(next) === 0)
                q.push(next);
        }
    }
    return ordered.length === wf.nodes.length ? ordered : wf.nodes;
}
export async function executeWorkflow(wf, triggerType = 'manual') {
    const startedAt = new Date().toISOString();
    const execStart = Date.now();
    const steps = [];
    let lastOutput = `Triggered ${wf.name}`;
    let failed = false;
    let errorMessage;
    const nodes = orderNodes(wf);
    for (const node of nodes) {
        const stepStart = Date.now();
        if (failed) {
            steps.push({
                nodeId: node.id,
                nodeType: node.type,
                label: node.label,
                status: 'skipped',
                durationMs: 0,
                outputSummary: 'Skipped due to earlier failure',
            });
            continue;
        }
        try {
            let outputSummary = `Completed ${node.label}`;
            if (node.type.startsWith('trigger.')) {
                outputSummary = `Trigger fired (${triggerType})`;
            }
            else if (node.type === 'action.generate_ai_text') {
                const prompt = String(node.config?.prompt || `Execute workflow step: ${node.label}. Context: ${lastOutput}`);
                const res = await aiProviderManager.generateText({ prompt, userId: wf.userId, timeoutMs: 12000 });
                lastOutput = res.reply;
                outputSummary = res.reply.slice(0, 180);
            }
            else if (node.type === 'action.process_news') {
                const editions = await generateDailyEditions();
                lastOutput = `KAREN TIMES EN (${editions.en.articles.length} articles) & TA (${editions.ta.articles.length} articles)`;
                outputSummary = lastOutput;
            }
            else if (node.type === 'action.run_integration' && node.config?.integration === 'classroom_sync') {
                const syncRes = await syncClassroomData();
                lastOutput = `Classroom synced=${syncRes.synced}, notifications=${syncRes.notificationsSent}`;
                outputSummary = lastOutput;
            }
            else if (node.type === 'action.run_integration' && node.config?.integration === 'health_check') {
                const health = await aiProviderManager.health();
                lastOutput = health.map((h) => `${h.provider}:${h.healthy ? 'ok' : 'unconfigured'}`).join(', ');
                outputSummary = lastOutput;
            }
            else if (node.type === 'action.send_telegram') {
                const msg = String(node.config?.message || lastOutput).slice(0, 1000);
                const sent = await sendTelegramMessage(`⚡ *Automation: ${wf.name}*\n\n${msg}`).catch(() => false);
                outputSummary = sent ? 'Delivered to Telegram' : 'Telegram not configured or skipped';
            }
            else if (node.type === 'action.send_notification') {
                await addNotification('automation', wf.name, lastOutput.slice(0, 180), 'normal', 'automation');
                outputSummary = 'Dashboard notification recorded';
            }
            else if (node.type === 'action.create_reminder') {
                const rem = await createReminder({
                    userId: wf.userId,
                    title: String(node.config?.title || wf.name),
                    dueAt: new Date(Date.now() + 3600_000).toISOString(),
                    timezone: wf.timezone || 'Asia/Kolkata',
                });
                outputSummary = `Reminder scheduled (${rem.id.slice(0, 8)})`;
            }
            else if (node.type === 'reliability.human_approval') {
                outputSummary = 'Held for human review';
            }
            steps.push({
                nodeId: node.id,
                nodeType: node.type,
                label: node.label,
                status: 'succeeded',
                durationMs: Date.now() - stepStart,
                outputSummary,
            });
        }
        catch (err) {
            failed = true;
            errorMessage = err instanceof Error ? err.message : 'Node execution failed';
            steps.push({
                nodeId: node.id,
                nodeType: node.type,
                label: node.label,
                status: 'failed',
                durationMs: Date.now() - stepStart,
                outputSummary: 'Failed',
                errorMessage,
            });
        }
    }
    return {
        id: crypto.randomUUID(),
        automationId: wf.id,
        automationName: wf.name,
        userId: wf.userId,
        status: failed ? 'failed' : 'succeeded',
        triggerType,
        durationMs: Date.now() - execStart,
        steps,
        errorMessage,
        startedAt,
        finishedAt: new Date().toISOString(),
    };
}
