import { z } from 'zod';
import { createApprovalRequest } from '../../services/approval.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { businessWritingInstructions, businessWritingMeta } from './meta.js';

const queueEmailInput = z.object({
  to: z.string().min(3).max(200),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
});

export const queueBusinessEmailApprovalTool: SkillToolDefinition<z.infer<typeof queueEmailInput>> = {
  name: 'queue_business_email_approval',
  description: 'Queue a drafted business email for owner approval before sending.',
  inputSchema: queueEmailInput,
  async execute(args) {
    const approval = await createApprovalRequest(
      'send_email',
      `Send email "${args.subject}" to ${args.to}`,
      { to: args.to, subject: args.subject, body: args.body }
    );
    return {
      ok: true,
      summary: `Queued business email "${args.subject}" to ${args.to} for approval.`,
      pendingApproval: { id: approval.id, summary: approval.summary },
    };
  },
};

export const businessWritingSkill: SkillModule = {
  meta: businessWritingMeta,
  instructions: businessWritingInstructions,
  tools: [queueBusinessEmailApprovalTool],
};
