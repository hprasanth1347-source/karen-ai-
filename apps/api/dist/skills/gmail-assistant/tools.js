import { z } from 'zod';
import { getGoogleContextForPrompt } from '../../routes/googleDrive.js';
import { wrapUntrustedContent } from '../../services/actionPolicy.service.js';
import { createApprovalRequest } from '../../services/approval.service.js';
import { addTask } from '../../services/task.service.js';
import { gmailAssistantInstructions, gmailAssistantMeta } from './meta.js';
export const readGmailContextTool = {
    name: 'read_gmail_context',
    description: 'Fetch recent/unread Gmail context matching a query (wrapped as untrusted content).',
    inputSchema: z.object({ query: z.string().default('unread important emails') }),
    async execute(args) {
        const raw = await getGoogleContextForPrompt(args.query).catch(() => '');
        const wrapped = raw ? wrapUntrustedContent('gmail', raw) : 'No Gmail messages found or Google is not connected.';
        return { ok: true, summary: 'Fetched Gmail context.', data: { context: wrapped } };
    },
};
const queueEmailInput = z.object({
    to: z.string().min(3).max(200),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(8000),
    attachmentQuery: z.string().optional(),
});
export const queueEmailApprovalTool = {
    name: 'queue_email_approval',
    description: 'Queue an email (optionally with a Drive attachment) for owner approval.',
    inputSchema: queueEmailInput,
    async execute(args) {
        const approval = await createApprovalRequest('send_email', `Send email "${args.subject}"${args.attachmentQuery ? ` (attach: ${args.attachmentQuery})` : ''} to ${args.to}`, {
            to: args.to,
            subject: args.subject,
            body: args.body,
            attachmentQuery: args.attachmentQuery || '',
        });
        return {
            ok: true,
            summary: `Queued email "${args.subject}" to ${args.to} for approval.`,
            pendingApproval: { id: approval.id, summary: approval.summary },
        };
    },
};
const followupInput = z.object({
    title: z.string().min(1).max(200),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const createEmailFollowupTaskTool = {
    name: 'create_email_followup_task',
    description: 'Create a follow-up reminder task for an email thread.',
    inputSchema: followupInput,
    async execute(args) {
        const task = await addTask(args.title, args.dueDate, 'medium', 'gmail_followup');
        return { ok: true, summary: `Created follow-up task "${task.title}".`, data: { taskId: task.id } };
    },
};
export const gmailAssistantSkill = {
    meta: gmailAssistantMeta,
    instructions: gmailAssistantInstructions,
    tools: [readGmailContextTool, queueEmailApprovalTool, createEmailFollowupTaskTool],
};
