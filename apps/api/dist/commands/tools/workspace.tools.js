import { z } from 'zod';
import { appendGoogleSheetRows, createCalendarEvent, createGoogleSheet, createGoogleTask, listCalendarEvents, listGoogleTasks, readGoogleSheet, updateGoogleSheetRange, } from '../../services/googleWorkspace.service.js';
import { addMemory, listMemories } from '../../services/memory.service.js';
import { addTask, listTasks } from '../../services/task.service.js';
export const calendarListEventsTool = {
    name: 'calendar_list_events',
    category: 'system',
    description: 'List upcoming Google Calendar events.',
    requiresConfirmation: false,
    inputSchema: z.object({ daysAhead: z.number().int().min(1).max(30).default(7) }),
    jsonSchema: { type: 'object', properties: { daysAhead: { type: 'number' } } },
    async execute(args, ctx) {
        const res = await listCalendarEvents(args.daysAhead ?? 7, ctx.userId);
        if (!res.ok)
            return { ok: false, summary: res.error || 'Could not load calendar.', fixButton: { label: 'Reconnect Google', url: '/drive' } };
        if (res.events.length === 0)
            return { ok: true, summary: 'No upcoming events on your Google Calendar.' };
        const lines = res.events.slice(0, 10).map((e, i) => `${i + 1}. *${e.summary}* — ${e.start}`);
        return { ok: true, summary: `Upcoming Calendar Events:\n${lines.join('\n')}` };
    },
};
export const calendarCreateEventTool = {
    name: 'calendar_create_event',
    category: 'system',
    description: 'Create an event on Google Calendar.',
    requiresConfirmation: false,
    inputSchema: z.object({
        summary: z.string().min(1),
        startIso: z.string().min(4),
        description: z.string().optional(),
    }),
    jsonSchema: {
        type: 'object',
        properties: { summary: { type: 'string' }, startIso: { type: 'string' }, description: { type: 'string' } },
        required: ['summary', 'startIso'],
    },
    async execute(args, ctx) {
        const res = await createCalendarEvent({ ...args, userId: ctx.userId });
        if (!res.ok)
            return { ok: false, summary: res.error || 'Calendar create failed.', fixButton: { label: 'Reconnect Google', url: '/drive' } };
        return { ok: true, summary: `📅 Added to Google Calendar: *${res.event?.summary}* (${res.event?.start}).` };
    },
};
export const googleTasksListTool = {
    name: 'google_tasks_list',
    category: 'tasks',
    description: 'List both Karen local tasks and Google Tasks.',
    requiresConfirmation: false,
    inputSchema: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    async execute(_args, ctx) {
        const [localTasks, gTasks] = await Promise.all([
            listTasks().catch(() => []),
            listGoogleTasks(ctx.userId).catch(() => ({ ok: false, tasks: [] })),
        ]);
        const activeLocal = localTasks.filter((t) => t.status !== 'done').slice(0, 8);
        const gList = gTasks.ok ? gTasks.tasks.slice(0, 8) : [];
        const lines = [];
        if (activeLocal.length > 0) {
            lines.push('*Karen Tasks:*\n' + activeLocal.map((t, i) => `${i + 1}. [${t.priority}] ${t.title}${t.due ? ` (${t.due})` : ''}`).join('\n'));
        }
        if (gList.length > 0) {
            lines.push('*Google Tasks:*\n' + gList.map((t, i) => `${i + 1}. ${t.title}${t.due ? ` (${t.due.slice(0, 10)})` : ''}`).join('\n'));
        }
        return { ok: true, summary: lines.length > 0 ? lines.join('\n\n') : 'No active tasks found.' };
    },
};
export const googleTasksCreateTool = {
    name: 'google_tasks_create',
    category: 'tasks',
    description: 'Create a task in both Karen Tasks and Google Tasks.',
    requiresConfirmation: false,
    inputSchema: z.object({ title: z.string().min(1), dueDate: z.string().optional() }),
    jsonSchema: { type: 'object', properties: { title: { type: 'string' }, dueDate: { type: 'string' } }, required: ['title'] },
    async execute(args, ctx) {
        const [local, gRes] = await Promise.all([
            addTask(args.title, args.dueDate, 'medium', 'command_engine'),
            createGoogleTask({ title: args.title, dueIso: args.dueDate, userId: ctx.userId }).catch(() => ({ ok: false })),
        ]);
        return {
            ok: true,
            summary: `✅ Created task "${local.title}"${gRes.ok ? ' (synced to Google Tasks)' : ''}.`,
        };
    },
};
export const sheetsCreateTool = {
    name: 'sheets_create',
    category: 'drive',
    description: 'Create a new Google Sheet with optional headers and initial rows.',
    requiresConfirmation: false,
    inputSchema: z.object({
        title: z.string().min(1).max(160),
        headers: z.array(z.string()).optional(),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).optional(),
    }),
    jsonSchema: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            headers: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'array' } },
        },
        required: ['title'],
    },
    async execute(args, ctx) {
        const res = await createGoogleSheet({ ...args, userId: ctx.userId });
        if (!res.ok)
            return { ok: false, summary: res.error || 'Sheet create failed.', fixButton: { label: 'Reconnect Google', url: '/drive' } };
        return {
            ok: true,
            summary: `📊 Created Google Sheet *${res.title}*!\nID: \`${res.spreadsheetId}\`\n${res.spreadsheetUrl}`,
            buttons: res.spreadsheetUrl ? [[{ label: 'Open Sheet', url: res.spreadsheetUrl }]] : undefined,
        };
    },
};
export const sheetsReadTool = {
    name: 'sheets_read',
    category: 'drive',
    description: 'Read values from a Google Sheet by spreadsheet ID and optional A1 range.',
    requiresConfirmation: false,
    inputSchema: z.object({ spreadsheetId: z.string().min(5), range: z.string().default('A1:Z30') }),
    jsonSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' } }, required: ['spreadsheetId'] },
    async execute(args, ctx) {
        const res = await readGoogleSheet({ ...args, userId: ctx.userId });
        if (!res.ok)
            return { ok: false, summary: res.error || 'Sheet read failed.' };
        if (res.values.length === 0)
            return { ok: true, summary: 'Sheet is empty.' };
        const preview = res.values.slice(0, 15).map((r) => r.join(' | ')).join('\n');
        return { ok: true, summary: `📊 Sheet Data:\n${preview}` };
    },
};
export const sheetsEditTool = {
    name: 'sheets_edit',
    category: 'drive',
    description: 'Append rows or update a specific A1 range in a Google Sheet.',
    requiresConfirmation: false,
    inputSchema: z.object({
        spreadsheetId: z.string().min(5),
        mode: z.enum(['append', 'update']).default('append'),
        range: z.string().default('A1'),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).min(1),
    }),
    jsonSchema: {
        type: 'object',
        properties: {
            spreadsheetId: { type: 'string' },
            mode: { type: 'string', enum: ['append', 'update'] },
            range: { type: 'string' },
            rows: { type: 'array', items: { type: 'array' } },
        },
        required: ['spreadsheetId', 'rows'],
    },
    async execute(args, ctx) {
        if (args.mode === 'update') {
            const res = await updateGoogleSheetRange({
                spreadsheetId: args.spreadsheetId,
                range: args.range || 'A1',
                values: args.rows,
                userId: ctx.userId,
            });
            if (!res.ok)
                return { ok: false, summary: res.error || 'Sheet update failed.' };
            return { ok: true, summary: `✅ Updated ${res.updatedCells ?? 0} cell(s) in Google Sheet.` };
        }
        const res = await appendGoogleSheetRows({
            spreadsheetId: args.spreadsheetId,
            range: args.range,
            rows: args.rows,
            userId: ctx.userId,
        });
        if (!res.ok)
            return { ok: false, summary: res.error || 'Sheet append failed.' };
        return { ok: true, summary: `✅ Appended ${res.updatedRows ?? args.rows.length} row(s) to Google Sheet (${res.updatedRange || args.range}).` };
    },
};
export const memoryListTool = {
    name: 'memory_list',
    category: 'system',
    description: 'List saved personal memories from Personal Memory.',
    requiresConfirmation: false,
    inputSchema: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    async execute() {
        const memories = await listMemories();
        if (memories.length === 0)
            return { ok: true, summary: 'No personal memories saved yet.' };
        const lines = memories.slice(0, 10).map((m, i) => `${i + 1}. [${m.category}] ${m.content}`);
        return { ok: true, summary: `🧠 Personal Memories (${memories.length}):\n${lines.join('\n')}` };
    },
};
export const memorySaveTool = {
    name: 'memory_save',
    category: 'system',
    description: 'Save a new personal memory.',
    requiresConfirmation: false,
    inputSchema: z.object({
        content: z.string().min(2).max(500),
        category: z.enum(['personal', 'work', 'preference', 'fact', 'instruction', 'other']).default('personal'),
    }),
    jsonSchema: { type: 'object', properties: { content: { type: 'string' }, category: { type: 'string' } }, required: ['content'] },
    async execute(args) {
        const saved = await addMemory(args.content, args.category, undefined, 'user_confirmed');
        return { ok: true, summary: `🧠 Saved to Personal Memory: "${saved.content}".` };
    },
};
import { createGoogleContact, listGoogleContacts } from '../../services/googleWorkspace.service.js';
export const googleContactsSearchTool = {
    name: 'google_contacts_search',
    category: 'system',
    description: 'Search or list contacts from Google Contacts (People API).',
    requiresConfirmation: false,
    inputSchema: z.object({ query: z.string().optional() }),
    jsonSchema: { type: 'object', properties: { query: { type: 'string' } } },
    async execute(args, ctx) {
        const res = await listGoogleContacts(args.query, ctx.userId);
        if (!res.ok) {
            return {
                ok: false,
                summary: res.error || 'Could not load Google Contacts.',
                fixButton: { label: 'Reconnect Google', url: '/contacts' },
            };
        }
        if (res.contacts.length === 0)
            return { ok: true, summary: 'No matching Google Contacts found.' };
        const lines = res.contacts
            .slice(0, 10)
            .map((c, i) => `${i + 1}. *${c.name}*${c.emails[0] ? ` — ${c.emails[0]}` : ''}${c.phones[0] ? ` (${c.phones[0]})` : ''}`);
        return { ok: true, summary: `📇 Google Contacts (${res.contacts.length}):\n${lines.join('\n')}` };
    },
};
export const googleContactsCreateTool = {
    name: 'google_contacts_create',
    category: 'system',
    description: 'Create a new contact in Google Contacts.',
    requiresConfirmation: false,
    inputSchema: z.object({
        givenName: z.string().min(1),
        email: z.string().optional(),
        phone: z.string().optional(),
    }),
    jsonSchema: { type: 'object', properties: { givenName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } }, required: ['givenName'] },
    async execute(args, ctx) {
        const res = await createGoogleContact({ ...args, userId: ctx.userId });
        if (!res.ok)
            return { ok: false, summary: res.error || 'Could not create contact.', fixButton: { label: 'Reconnect Google', url: '/contacts' } };
        return { ok: true, summary: `📇 Saved *${res.contact?.name}* to Google Contacts.` };
    },
};
