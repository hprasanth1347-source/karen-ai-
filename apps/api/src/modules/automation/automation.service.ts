import crypto from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import { validateWorkflowGraph } from './workflow.validator.js';
import { executeWorkflow } from './workflow.executor.js';
import { AUTOMATION_TEMPLATES } from './workflow.registry.js';
import type { WorkflowDefinition, WorkflowExecution } from './workflow.types.js';

const workflowsStore = new Map<string, WorkflowDefinition>();
const executionsStore: WorkflowExecution[] = [];

export async function createWorkflow(
  userId: string,
  input: Omit<WorkflowDefinition, 'id' | 'userId' | 'version' | 'createdAt' | 'updatedAt' | 'requiresApproval'>
): Promise<{ ok: boolean; workflow?: WorkflowDefinition; errors?: string[] }> {
  const check = validateWorkflowGraph({ name: input.name, nodes: input.nodes, edges: input.edges });
  if (!check.valid) return { ok: false, errors: check.errors };

  const now = new Date().toISOString();
  const wf: WorkflowDefinition = {
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

export function listWorkflows(userId: string): WorkflowDefinition[] {
  return Array.from(workflowsStore.values())
    .filter((w) => w.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWorkflow(id: string, userId: string): WorkflowDefinition | null {
  const wf = workflowsStore.get(id);
  if (!wf || wf.userId !== userId) return null;
  return wf;
}

export function setWorkflowStatus(
  id: string,
  userId: string,
  status: 'active' | 'paused'
): WorkflowDefinition | null {
  const wf = getWorkflow(id, userId);
  if (!wf) return null;
  wf.status = status;
  wf.updatedAt = new Date().toISOString();
  workflowsStore.set(id, wf);
  return wf;
}

export function deleteWorkflow(id: string, userId: string): boolean {
  const wf = getWorkflow(id, userId);
  if (!wf) return false;
  return workflowsStore.delete(id);
}

export async function runWorkflowNow(
  id: string,
  userId: string,
  triggerType = 'manual'
): Promise<WorkflowExecution | null> {
  const wf = getWorkflow(id, userId);
  if (!wf) return null;
  const exec = await executeWorkflow(wf, triggerType);
  executionsStore.unshift(exec);
  if (executionsStore.length > 100) executionsStore.length = 100;
  return exec;
}

export function listExecutions(userId: string, statusFilter?: string): WorkflowExecution[] {
  return executionsStore
    .filter((e) => e.userId === userId && (!statusFilter || e.status === statusFilter))
    .slice(0, 50);
}

export function getAutomationStats(userId: string) {
  const wfs = listWorkflows(userId);
  const execs = listExecutions(userId);
  const avgDurationMs =
    execs.length > 0 ? Math.round(execs.reduce((s, e) => s + e.durationMs, 0) / execs.length) : 0;
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
