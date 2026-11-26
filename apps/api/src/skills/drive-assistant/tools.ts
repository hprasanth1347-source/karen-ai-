import { z } from 'zod';
import { getGoogleContextForPrompt } from '../../routes/googleDrive.js';
import { wrapUntrustedContent } from '../../services/actionPolicy.service.js';
import { createApprovalRequest } from '../../services/approval.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { driveAssistantInstructions, driveAssistantMeta } from './meta.js';

export const findDriveFilesTool: SkillToolDefinition<{ query: string }> = {
  name: 'find_drive_files',
  description: 'Search Google Drive files and return wrapped metadata/links.',
  inputSchema: z.object({ query: z.string().min(1).max(300) }),
  async execute(args) {
    const raw = await getGoogleContextForPrompt(`drive file ${args.query}`).catch(() => '');
    const wrapped = raw ? wrapUntrustedContent('drive', raw) : 'No matching Drive files found or Google is disconnected.';
    return { ok: true, summary: `Searched Google Drive for "${args.query}".`, data: { context: wrapped } };
  },
};

const shareDriveInput = z.object({
  channel: z.enum(['email', 'instagram']),
  recipient: z.string().min(1).max(200),
  fileName: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
});

export const queueDriveShareApprovalTool: SkillToolDefinition<z.infer<typeof shareDriveInput>> = {
  name: 'queue_drive_share_approval',
  description: 'Queue sharing a Google Drive file via email or Instagram for owner approval.',
  inputSchema: shareDriveInput,
  async execute(args) {
    const type = args.channel === 'email' ? 'send_email' : 'send_insta';
    const approval = await createApprovalRequest(
      type,
      `Share Drive file "${args.fileName}" via ${args.channel} to ${args.recipient}`,
      args.channel === 'email'
        ? { to: args.recipient, subject: `Shared file: ${args.fileName}`, body: args.message, attachmentQuery: args.fileName }
        : { username: args.recipient.replace(/^@/, ''), message: args.message }
    );
    return {
      ok: true,
      summary: `Queued sharing "${args.fileName}" via ${args.channel} for owner approval.`,
      pendingApproval: { id: approval.id, summary: approval.summary },
    };
  },
};

export const driveAssistantSkill: SkillModule = {
  meta: driveAssistantMeta,
  instructions: driveAssistantInstructions,
  tools: [findDriveFilesTool, queueDriveShareApprovalTool],
};
