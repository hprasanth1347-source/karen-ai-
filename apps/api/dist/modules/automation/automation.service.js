import crypto from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import { validateWorkflowGraph } from './workflow.validator.js';
import { executeWorkflow } from './workflow.executor.js';
import { AUTOMATION_TEMPLATES } from './workflow.registry.js';
const workflowsStore = new Map();
const executionsStore = [];
export async function createWorkflow(userId, input) {
    const check = validateWorkflowGraph({ name: input.name, nodes: input.nodes, edges: input.edges });
    if (!check.valid)
        return { ok: false, errors: check.errors };
    const now = new Date().toISOString();
    const wf = {
        ...input,
        id: crypto.randomUUID(),
        userId,
        version: 1,
        status: input.status || 'paused',
        timezone: input.timezone || 'Asia/Kolkata',
        requiresApproval: check.requiresApproval,
        createdAt: now,
        updatedAt: now,
    };
    workflowsStore.set(wf.id, wf);
    await supabaseAdmin
        .from('automations')
        .insert({
        id: wf.id,
        user_id: wf.userId,
        name: wf.name,
        description: wf.description,
        status: wf.status,
        version: wf.version,
        nodes: wf.nodes,
        edges: wf.edges,
        timezone: wf.timezone,
    })
        .then(() => { }, () => { });
    return { ok: true, workflow: wf };
}
export function listWorkflows(userId) {
    return Array.from(workflowsStore.values())
        .filter((w) => w.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getWorkflow(id, userId) {
    const wf = workflowsStore.get(id);
    if (!wf || wf.userId !== userId)
        return null;
    return wf;
}
export function setWorkflowStatus(id, userId, status) {
    const wf = getWorkflow(id, userId);
    if (!wf)
        return null;
    wf.status = status;
    wf.updatedAt = new Date().toISOString();
    workflowsStore.set(id, wf);
    return wf;
}
export function deleteWorkflow(id, userId) {
    const wf = getWorkflow(id, userId);
    if (!wf)
        return false;
    return workflowsStore.delete(id);
}
export async function runWorkflowNow(id, userId, triggerType = 'manual') {
    const wf = getWorkflow(id, userId);
    if (!wf)
        return null;
    const exec = await executeWorkflow(wf, triggerType);
    executionsStore.unshift(exec);
    if (executionsStore.length > 100)
        executionsStore.length = 100;
    return exec;
}
export function listExecutions(userId, statusFilter) {
    return executionsStore
        .filter((e) => e.userId === userId && (!statusFilter || e.status === statusFilter))
        .slice(0, 50);
}
export function getAutomationStats(userId) {
    const wfs = listWorkflows(userId);
    const execs = listExecutions(userId);
    const avgDurationMs = execs.length > 0 ? Math.round(execs.reduce((s, e) => s + e.durationMs, 0) / execs.length) : 0;
    return {
        totalWorkflows: wfs.length,
        activeWorkflows: wfs.filter((w) => w.status === 'active').length,
        pausedWorkflows: wfs.filter((w) => w.status === 'paused').length,
        totalExecutions: execs.length,
        succeededExecutions: execs.filter((e) => e.status === 'succeeded').length,
        failedExecutions: execs.filter((e) => e.status === 'failed').length,
        avgDurationMs,
        templatesCount: AUTOMATION_TEMPLATES.length,
    };
}
