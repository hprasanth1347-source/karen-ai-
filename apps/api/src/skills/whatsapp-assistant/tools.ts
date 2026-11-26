import { z } from 'zod';
import { createApprovalRequest } from '../../services/approval.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { whatsappAssistantInstructions, whatsappAssistantMeta } from './meta.js';

const queueWaInput = z.object({
  phoneNumber: z.string().min(6).max(30),
  message: z.string().min(1).max(2000),
  within24hWindow: z.boolean().default(true),
  templateName: z.string().optional(),
});

export const queueWhatsappApprovalTool: SkillToolDefinition<z.infer<typeof queueWaInput>> = {
  name: 'queue_whatsapp_approval',
  description: 'Queue a WhatsApp message or template for owner approval before sending.',
  inputSchema: queueWaInput,
  async execute(args) {
    if (!args.within24hWindow && !args.templateName) {
      return {
        ok: false,
        summary: 'Outside 24h WhatsApp window: a templateName is required.',
        error: 'WhatsApp Cloud API requires an approved template outside the 24-hour window.',
      };
    }
    const approval = await createApprovalRequest(
      'send_insta',
      `WhatsApp to ${args.phoneNumber}${args.templateName ? ` [template: ${args.templateName}]` : ''}`,
      {
        channel: 'whatsapp',
        phoneNumber: args.phoneNumber,
        message: args.message,
        templateName: args.templateName || '',
      }
    );
    return {
      ok: true,
      summary: `Queued WhatsApp message to ${args.phoneNumber} for approval.`,
      pendingApproval: { id: approval.id, summary: approval.summary },
    };
  },
};

export const whatsappAssistantSkill: SkillModule = {
  meta: whatsappAssistantMeta,
  instructions: whatsappAssistantInstructions,
  tools: [queueWhatsappApprovalTool],
};
