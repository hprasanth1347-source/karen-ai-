import { z } from 'zod';
import { aiProviderManager } from '../../services/aiProviderManager.service.js';
import { ALLOWED_NODE_TYPES, validateWorkflowGraph } from './workflow.validator.js';
const PlannedWorkflowSchema = z.object({
    name: z.string().min(2),
    description: z.string().default(''),
    scheduleCron: z.string().optional(),
    nodes: z.array(z.object({
        id: z.string().min(1),
        type: z.string(),
        label: z.string().min(1),
        config: z.record(z.unknown()).default({}),
    })),
    edges: z.array(z.object({
        id: z.string().min(1),
        source: z.string().min(1),
        target: z.string().min(1),
        condition: z.string().optional(),
    })),
});
export async function planWorkflowFromInstruction(instruction, userId) {
    const allowedList = Array.from(ALLOWED_NODE_TYPES).join(', ');
    const prompt = `Convert the user's automation instruction into a safe, typed Karen AI workflow DAG.
User instruction: "${instruction.slice(0, 600)}"
Allowed node types ONLY: ${allowedList}
Timezone: Asia/Kolkata. Never output JavaScript, shell commands, or SQL.
Return JSON: { name, description, scheduleCron?, nodes: [{ id, type, label, config }], edges: [{ id, source, target }] }.`;
    let planned;
    try {
        planned = await aiProviderManager.generateStructuredOutput({ prompt, userId }, PlannedWorkflowSchema);
    }
    catch {
        // Deterministic safe fallback plan based on instruction keywords
        const lower = instruction.toLowerCase();
        const isNewspaper = /newspaper|karen times|news/i.test(lower);
        const isClassroom = /classroom|assignment|student/i.test(lower);
        const isInsta = /instagram|insta|dm/i.test(lower);
        const isDaily = /morning|evening|daily|7\s*am|8\s*pm|every\s+day/i.test(lower);
        const triggerNode = isDaily
            ? { id: 'n1', type: 'trigger.schedule', label: 'Scheduled Trigger (IST)', config: { cron: '0 7 * * *', timezone: 'Asia/Kolkata' } }
            : isInsta
                ? { id: 'n1', type: 'trigger.new_message', label: 'Instagram DM Webhook', config: { channel: 'instagram' } }
                : { id: 'n1', type: 'trigger.manual', label: 'Manual Trigger', config: {} };
        const actionNode = isNewspaper
            ? { id: 'n2', type: 'action.process_news', label: 'Generate KAREN TIMES', config: { languages: ['en', 'ta'] } }
            : isClassroom
                ? { id: 'n2', type: 'action.run_integration', label: 'Sync Classroom Assignments', config: { integration: 'classroom_sync' } }
                : { id: 'n2', type: 'action.generate_ai_text', label: 'AI Task Execution', config: { prompt: instruction } };
        planned = {
            name: instruction.slice(0, 48).trim() || 'Custom Automation',
            description: instruction,
            scheduleCron: isDaily ? '0 7 * * *' : undefined,
            nodes: [
                triggerNode,
                actionNode,
                { id: 'n3', type: 'action.send_telegram', label: 'Notify on Telegram', config: {} },
            ],
            edges: [
                { id: 'e1', source: 'n1', target: 'n2' },
                { id: 'e2', source: 'n2', target: 'n3' },
            ],
        };
    }
    const typedNodes = planned.nodes.map((n) => ({
        ...n,
        type: n.type,
    }));
    const validation = validateWorkflowGraph({ name: planned.name, nodes: typedNodes, edges: planned.edges });
    return {
        workflow: {
            userId,
            name: planned.name,
            description: planned.description || instruction,
            timezone: 'Asia/Kolkata',
            scheduleCron: planned.scheduleCron,
            nodes: typedNodes,
            edges: planned.edges,
            requiresApproval: validation.requiresApproval,
        },
        validation,
    };
}
