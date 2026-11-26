import { z } from 'zod';
import { deleteCommandMacro, listCommandMacros, saveCommandMacro } from '../state.js';
export const macroSaveTool = {
    name: 'macro_save',
    category: 'macros',
    description: 'Save a custom shortcut macro ("when I say X, do Y").',
    requiresConfirmation: false,
    inputSchema: z.object({
        triggerPhrase: z.string().min(2).max(80),
        instruction: z.string().min(3).max(500),
    }),
    jsonSchema: {
        type: 'object',
        properties: { triggerPhrase: { type: 'string' }, instruction: { type: 'string' } },
        required: ['triggerPhrase', 'instruction'],
    },
    async execute(args, ctx) {
        const saved = await saveCommandMacro(args.triggerPhrase, args.instruction, ctx.userId);
        return {
            ok: true,
            summary: `✅ Saved shortcut "${saved.triggerPhrase}" → "${args.instruction}".`,
            data: saved,
        };
    },
};
export const macroListTool = {
    name: 'macro_list',
    category: 'macros',
    description: 'List all saved command shortcuts/macros.',
    requiresConfirmation: false,
    inputSchema: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    async execute() {
        const macros = await listCommandMacros();
        if (macros.length === 0) {
            return { ok: true, summary: 'No custom macros saved yet. Say: "when I say \'my work\' show pending assignments and latest 5 mails".' };
        }
        const lines = macros.map((m, i) => `${i + 1}. "${m.triggerPhrase}" → ${m.steps.map((s) => s.instruction).join(' ; ')}`);
        return { ok: true, summary: `Saved Macros (${macros.length}):\n${lines.join('\n')}` };
    },
};
export const macroDeleteTool = {
    name: 'macro_delete',
    category: 'macros',
    description: 'Delete a saved command macro by trigger phrase or ID.',
    requiresConfirmation: false,
    inputSchema: z.object({ triggerOrId: z.string().min(1) }),
    jsonSchema: { type: 'object', properties: { triggerOrId: { type: 'string' } }, required: ['triggerOrId'] },
    async execute(args) {
        const ok = await deleteCommandMacro(args.triggerOrId);
        return {
            ok,
            summary: ok ? `🗑️ Deleted macro "${args.triggerOrId}".` : `Macro "${args.triggerOrId}" not found.`,
        };
    },
};
