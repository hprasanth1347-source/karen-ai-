import { Router } from 'express';
import { requireAuth, requireOwner } from '../../middleware/auth.js';
import { success, error } from '../../utils/response.js';
import { AUTOMATION_TEMPLATES } from './workflow.registry.js';
import { planWorkflowFromInstruction } from './workflow.planner.js';
import { createWorkflow, deleteWorkflow, getAutomationStats, listExecutions, listWorkflows, runWorkflowNow, setWorkflowStatus, } from './automation.service.js';
const router = Router();
router.use('/automations', requireAuth, requireOwner);
router.get('/automations', (req, res) => {
    const userId = req.user.id;
    return success(res, {
        stats: getAutomationStats(userId),
        workflows: listWorkflows(userId),
        executions: listExecutions(userId),
        templates: AUTOMATION_TEMPLATES,
    });
});
router.post('/automations', async (req, res) => {
    const userId = req.user.id;
    const created = await createWorkflow(userId, {
        name: String(req.body?.name || ''),
        description: String(req.body?.description || ''),
        status: req.body?.status === 'active' ? 'active' : 'paused',
        timezone: String(req.body?.timezone || 'Asia/Kolkata'),
        scheduleCron: req.body?.scheduleCron,
        nodes: Array.isArray(req.body?.nodes) ? req.body.nodes : [],
        edges: Array.isArray(req.body?.edges) ? req.body.edges : [],
    });
    if (!created.ok) {
        return error(res, created.errors?.join('; ') || 'Invalid workflow', 400, 'VALIDATION_ERROR');
    }
    return success(res, created.workflow, 201);
});
router.post('/automations/plan', async (req, res) => {
    const instruction = String(req.body?.instruction || '').trim();
    if (!instruction)
        return error(res, 'instruction is required', 400, 'VALIDATION_ERROR');
    const planned = await planWorkflowFromInstruction(instruction, req.user.id);
    return success(res, planned);
});
router.post('/automations/from-template/:templateId', async (req, res) => {
    const tpl = AUTOMATION_TEMPLATES.find((t) => t.id === String(req.params.templateId));
    if (!tpl)
        return error(res, 'Template not found', 404, 'NOT_FOUND');
    const created = await createWorkflow(req.user.id, {
        name: tpl.name,
        description: tpl.description,
        status: 'paused',
        timezone: 'Asia/Kolkata',
        scheduleCron: tpl.scheduleCron,
        nodes: tpl.nodes,
        edges: tpl.edges,
    });
    if (!created.ok)
        return error(res, 'Template validation failed', 400);
    return success(res, created.workflow, 201);
});
router.post('/automations/:id/run', async (req, res) => {
    const exec = await runWorkflowNow(String(req.params.id), req.user.id, 'manual');
    if (!exec)
        return error(res, 'Workflow not found', 404, 'NOT_FOUND');
    return success(res, exec);
});
router.post('/automations/:id/toggle', (req, res) => {
    const nextStatus = req.body?.status === 'active' ? 'active' : 'paused';
    const updated = setWorkflowStatus(String(req.params.id), req.user.id, nextStatus);
    if (!updated)
        return error(res, 'Workflow not found', 404, 'NOT_FOUND');
    return success(res, updated);
});
router.delete('/automations/:id', (req, res) => {
    const deleted = deleteWorkflow(String(req.params.id), req.user.id);
    if (!deleted)
        return error(res, 'Workflow not found', 404, 'NOT_FOUND');
    return success(res, { deleted: true });
});
export default router;
