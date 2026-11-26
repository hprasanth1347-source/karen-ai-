import { z } from 'zod';
import { createApprovalRequest } from '../../services/approval.service.js';
import { instagramCommentsInstructions, instagramCommentsMeta } from './meta.js';
const leadDmInput = z.object({
    username: z.string().min(1).max(100),
    message: z.string().min(1).max(1500),
});
export const queueCommentLeadDmTool = {
    name: 'queue_comment_lead_dm',
    description: 'Queue a private Instagram DM reply for a comment lead (approval required).',
    inputSchema: leadDmInput,
    async execute(args) {
        const cleanUser = args.username.replace(/^@/, '').toLowerCase();
        const approval = await createApprovalRequest('send_insta', `Private DM to comment lead @${cleanUser}`, {
            username: cleanUser,
            message: args.message,
        });
        return {
            ok: true,
            summary: `Queued private DM to @${cleanUser} for approval.`,
            pendingApproval: { id: approval.id, summary: approval.summary },
        };
    },
};
export const instagramCommentsSkill = {
    meta: instagramCommentsMeta,
    instructions: instagramCommentsInstructions,
    tools: [queueCommentLeadDmTool],
};
