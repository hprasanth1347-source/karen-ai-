export const ALLOWED_NODE_TYPES = new Set([
    'trigger.manual', 'trigger.schedule', 'trigger.webhook', 'trigger.new_message',
    'trigger.new_assignment', 'trigger.new_rss', 'trigger.file_uploaded', 'trigger.db_event', 'trigger.integration_event',
    'action.send_telegram', 'action.send_notification', 'action.generate_ai_text', 'action.generate_image',
    'action.fetch_rss', 'action.process_news', 'action.generate_pdf', 'action.send_email',
    'action.create_reminder', 'action.update_record', 'action.run_integration',
    'logic.if_else', 'logic.switch', 'logic.filter', 'logic.delay', 'logic.wait_event',
    'logic.loop', 'logic.batch', 'logic.parallel', 'logic.merge', 'logic.ai_classify',
    'reliability.retry', 'reliability.error_handler', 'reliability.timeout',
    'reliability.fallback', 'reliability.human_approval', 'reliability.stop',
]);
const SENSITIVE_ACTIONS = new Set([
    'action.send_email',
    'action.update_record',
]);
export function validateWorkflowGraph(wf) {
    const errors = [];
    if (!wf.name || wf.name.trim().length < 2) {
        errors.push('Workflow name must be at least 2 characters.');
    }
    if (!Array.isArray(wf.nodes) || wf.nodes.length === 0) {
        errors.push('Workflow must contain at least one node.');
        return { valid: false, errors, requiresApproval: false };
    }
    const nodeIds = new Set();
    let hasTrigger = false;
    let requiresApproval = false;
    for (const n of wf.nodes) {
        if (!n.id)
            errors.push('Every node must have a non-empty id.');
        if (nodeIds.has(n.id))
            errors.push(`Duplicate node id: ${n.id}`);
        nodeIds.add(n.id);
        if (!ALLOWED_NODE_TYPES.has(n.type)) {
            errors.push(`Unsupported or unauthorized node type: ${n.type}`);
        }
        if (n.type.startsWith('trigger.'))
            hasTrigger = true;
        if (SENSITIVE_ACTIONS.has(n.type))
            requiresApproval = true;
        const cfgStr = JSON.stringify(n.config || {});
        if (/(child_process|eval\(|rm\s+-rf|DROP\s+TABLE)/i.test(cfgStr)) {
            errors.push(`Dangerous configuration rejected in node ${n.id}`);
        }
    }
    if (!hasTrigger) {
        errors.push('Workflow must include at least one trigger node.');
    }
    const adj = new Map();
    for (const e of wf.edges || []) {
        if (!nodeIds.has(e.source))
            errors.push(`Edge ${e.id} references missing source node: ${e.source}`);
        if (!nodeIds.has(e.target))
            errors.push(`Edge ${e.id} references missing target node: ${e.target}`);
        if (e.source === e.target)
            errors.push(`Self-loop edge not permitted on node ${e.source}`);
        const list = adj.get(e.source) || [];
        list.push(e.target);
        adj.set(e.source, list);
    }
    // Cycle detection (DFS 3-color)
    const color = new Map();
    const hasCycle = (u) => {
        color.set(u, 1);
        for (const v of adj.get(u) || []) {
            const c = color.get(v) ?? 0;
            if (c === 1)
                return true;
            if (c === 0 && hasCycle(v))
                return true;
        }
        color.set(u, 2);
        return false;
    };
    for (const id of nodeIds) {
        if ((color.get(id) ?? 0) === 0 && hasCycle(id)) {
            errors.push('Circular execution path detected in workflow graph.');
            break;
        }
    }
    return { valid: errors.length === 0, errors, requiresApproval };
}
