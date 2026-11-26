import { z } from 'zod';
import { listGmailMessages, readGmailMessage } from '../../services/gmail.service.js';
import type { CommandToolDef, LastResultItem } from '../types.js';

export const gmailListTool: CommandToolDef<{
  query?: string;
  unread?: boolean;
  from?: string;
  newer_than?: string;
  limit?: number;
}> = {
  name: 'gmail_list',
  category: 'gmail',
  description: 'List latest, unread, or sender-filtered Gmail messages with metadata cards.',
  requiresConfirmation: false,
  inputSchema: z.object({
    query: z.string().optional(),
    unread: z.boolean().optional(),
    from: z.string().optional(),
    newer_than: z.string().optional(),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      unread: { type: 'boolean' },
      from: { type: 'string' },
      newer_than: { type: 'string' },
      limit: { type: 'number' },
    },
  },
  async execute(args, ctx) {
    const res = await listGmailMessages({ ...args, userId: ctx.userId });
    if (!res.ok) {
      return {
        ok: false,
        summary: res.error || 'Could not load Gmail.',
        fixButton: { label: 'Reconnect Google', url: '/drive' },
      };
    }
    if (res.items.length === 0) {
      return { ok: true, summary: 'No matching emails found.', lastResults: [] };
    }

    const lastResults: LastResultItem[] = res.items.map((m, idx) => ({
      ordinal: idx + 1,
      type: 'email',
      id: m.id,
      title: m.subject,
      subtitle: m.from,
      extra: { threadId: m.threadId || '', from: m.from, subject: m.subject },
    }));

    const lines = res.items.map(
      (m, idx) => `${idx + 1}. ${m.unread ? '🔵 ' : ''}${m.from} — *${m.subject}* (${m.dateIst})\n   ${m.snippet}`
    );

    return {
      ok: true,
      summary: `Latest Emails (${res.items.length}):\n${lines.join('\n')}`,
      lastResults,
      buttons: [
        [
          { label: 'Read #1', callbackData: `cmd:read_mail:${res.items[0].id}` },
          { label: 'Reply #1', callbackData: `cmd:reply_mail:${res.items[0].id}` },
        ],
      ],
    };
  },
};

export const gmailReadTool: CommandToolDef<{ id: string }> = {
  name: 'gmail_read',
  category: 'gmail',
  description: 'Read full body of an email by message ID.',
  requiresConfirmation: false,
  inputSchema: z.object({ id: z.string().min(1) }),
  jsonSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  async execute(args, ctx) {
    const res = await readGmailMessage(args.id, ctx.userId);
    if (!res.ok || !res.message) {
      return { ok: false, summary: res.error || 'Could not read email.' };
    }
    return {
      ok: true,
      summary: `From: ${res.message.from}\nSubject: ${res.message.subject}\nTime: ${res.message.dateIst}\n\n${res.message.bodyText}`,
      data: res.message,
    };
  },
};

export const gmailSendTool: CommandToolDef<{
  to?: string;
  subject?: string;
  body?: string;
  attachmentQuery?: string;
}> = {
  name: 'gmail_send',
  category: 'gmail',
  description: 'Prepare an email preview card (To/Subject/Body/Attachments) for owner confirmation before sending.',
  requiresConfirmation: true,
  inputSchema: z.object({
    to: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    attachmentQuery: z.string().optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      attachmentQuery: { type: 'string' },
    },
  },
  async execute(args, ctx) {
    if (!args.to || !args.to.includes('@')) {
      return {
        ok: true,
        summary: 'Who should I send this email to? Please reply with their email address.',
        needsClarification: {
          actionType: 'gmail_send',
          question: 'Who should I send this email to? (Please share their email address)',
          partialPayload: { ...args },
        },
      };
    }
    const subject = args.subject?.trim() || 'Quick note from Hari';
    const body = args.body?.trim() || 'Hi,\n\nPlease find the details.\n\nBest,\nHari';
    const attachNote = args.attachmentQuery || (ctx.lastUploadedFile ? ctx.lastUploadedFile.fileName : '');

    return {
      ok: true,
      summary: `Email preview ready for ${args.to}.`,
      pendingConfirmation: {
        actionType: 'gmail_send',
        payload: {
          to: args.to,
          subject,
          body,
          attachmentQuery: attachNote,
        },
        previewText: `📧 *Email Preview*\nTo: ${args.to}\nSubject: ${subject}${attachNote ? `\nAttachment: ${attachNote}` : ''}\n\n${body}`,
        buttons: [[{ label: 'Send', callbackData: 'confirm' }, { label: 'Cancel', callbackData: 'cancel' }]],
      },
    };
  },
};
