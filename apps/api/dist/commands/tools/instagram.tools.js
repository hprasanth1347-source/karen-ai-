import { z } from 'zod';
import { getInstagramConversations, resolveInstagramRecipient } from '../../providers/instagram.js';
import { wrapUntrustedContent } from '../../services/actionPolicy.service.js';
import { instagramAutoReplyService } from '../../services/instagramAutoReply.js';
export const instagramReadDmsTool = {
    name: 'instagram_read_dms',
    category: 'instagram',
    description: 'Read recent Instagram DM threads and auto-DM summary.',
    requiresConfirmation: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(10).default(5) }),
    jsonSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    async execute(args) {
        const [summaryText, convs] = await Promise.all([
            instagramAutoReplyService.getDmDigestSummary().catch(() => ''),
            getInstagramConversations().catch(() => []),
        ]);
        const slice = convs.slice(0, args.limit ?? 5);
        if (slice.length === 0) {
            return { ok: true, summary: summaryText || 'No recent Instagram DM threads found.' };
        }
        const wrapped = wrapUntrustedContent('instagram_dm', JSON.stringify(slice));
        return {
            ok: true,
            summary: `${summaryText ? `${summaryText}\n\n` : ''}Instagram DM Threads (${slice.length}):\n${wrapped}`,
        };
    },
};
export const instagramSendDmTool = {
    name: 'instagram_send_dm',
    category: 'instagram',
    description: 'Prepare an Instagram DM preview card for a username or contact name (exact username takes priority; owner confirmation required).',
    requiresConfirmation: true,
    inputSchema: z.object({
        recipient: z.string().optional(),
        message: z.string().optional(),
        kind: z.enum(['exact', 'compose']).default('exact'),
    }),
    jsonSchema: {
        type: 'object',
        properties: {
            recipient: { type: 'string' },
            message: { type: 'string' },
            kind: { type: 'string', enum: ['exact', 'compose'] },
        },
    },
    async execute(args) {
        if (!args.recipient || !args.recipient.trim()) {
            return {
                ok: true,
                summary: 'Who should I DM on Instagram? Please reply with their username or name.',
                needsClarification: {
                    actionType: 'instagram_send_dm',
                    question: 'Who should I DM on Instagram? (Please share their @username or name)',
                    partialPayload: { ...args },
                },
            };
        }
        if (!args.message || !args.message.trim()) {
            return {
                ok: true,
                summary: `What message should I send to @${args.recipient.replace(/^@/, '')} on Instagram?`,
                needsClarification: {
                    actionType: 'instagram_send_dm',
                    question: `What message should I send to ${args.recipient} on Instagram?`,
                    partialPayload: { ...args },
                },
            };
        }
        const cleanHandle = args.recipient.trim().replace(/^@/, '');
        const resolved = await resolveInstagramRecipient(cleanHandle).catch(() => null);
        const displayUser = resolved?.username || cleanHandle;
        return {
            ok: true,
            summary: `Instagram DM preview ready for @${displayUser}.`,
            pendingConfirmation: {
                actionType: 'instagram_send_dm',
                payload: {
                    recipientId: resolved?.id || '',
                    username: displayUser,
                    message: args.message.trim(),
                },
                previewText: `📸 *Instagram DM Preview*\nTo: @${displayUser}\nMessage: ${args.message.trim()}`,
                buttons: [[{ label: 'Send', callbackData: 'confirm' }, { label: 'Cancel', callbackData: 'cancel' }]],
            },
        };
    },
};
