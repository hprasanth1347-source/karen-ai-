import { z } from 'zod';
import { createApprovalRequest } from '../../services/approval.service.js';
import { wrapUntrustedContent } from '../../services/actionPolicy.service.js';
import { getInstagramConversations } from '../../providers/instagram.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { instagramDmReplyInstructions, instagramDmReplyMeta } from './meta.js';

export const listInstagramDmThreadsTool: SkillToolDefinition<Record<string, never>> = {
  name: 'list_instagram_dm_threads',
  description: 'Fetch recent Instagram DM threads (wrapped as untrusted content).',
  inputSchema: z.object({}),
  async execute() {
    const threads = await getInstagramConversations().catch(() => []);
    const wrapped = wrapUntrustedContent('instagram_dm', JSON.stringify(threads));
    return {
      ok: true,
      summary: `Fetched ${threads.length} Instagram DM thread(s).`,
      data: { count: threads.length, threadsContext: wrapped },
    };
  },
};

const queueInstaDmInput = z.object({
  username: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  escalateToOwner: z.boolean().default(false),
});

export const queueInstagramDmApprovalTool: SkillToolDefinition<z.infer<typeof queueInstaDmInput>> = {
  name: 'queue_instagram_dm_approval',
  description: 'Queue an Instagram DM reply for owner approval before sending.',
  inputSchema: queueInstaDmInput,
  async execute(args) {
    const cleanUser = args.username.replace(/^@/, '').toLowerCase();
    const approval = await createApprovalRequest(
      'send_insta',
      `${args.escalateToOwner ? '[Needs Owner Review] ' : ''}Send Instagram DM to @${cleanUser}`,
      { username: cleanUser, message: args.message }
    );
    return {
      ok: true,
      summary: `Queued Instagram DM to @${cleanUser} for approval.`,
      pendingApproval: { id: approval.id, summary: approval.summary },
    };
  },
};

export const instagramDmReplySkill: SkillModule = {
  meta: instagramDmReplyMeta,
  instructions: instagramDmReplyInstructions,
  tools: [listInstagramDmThreadsTool, queueInstagramDmApprovalTool],
};
