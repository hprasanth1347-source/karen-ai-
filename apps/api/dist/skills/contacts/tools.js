import { z } from 'zod';
import { addMemory } from '../../services/memory.service.js';
import { contactsInstructions, contactsMeta } from './meta.js';
const contactInput = z.object({
    name: z.string().min(1).max(120),
    handleOrEmail: z.string().min(1).max(200),
    isVip: z.boolean().default(false),
    notes: z.string().max(400).optional(),
});
export const upsertContactNoteTool = {
    name: 'upsert_contact_note',
    description: 'Save or update a contact record with VIP status and notes.',
    inputSchema: contactInput,
    async execute(args) {
        const summary = `Contact ${args.name} (${args.handleOrEmail})${args.isVip ? ' [VIP]' : ''}${args.notes ? ` — ${args.notes}` : ''}`;
        await addMemory(summary, 'personal', undefined, 'user_confirmed');
        return { ok: true, summary: `Saved contact: ${summary}`, data: args };
    },
};
export const contactsSkill = {
    meta: contactsMeta,
    instructions: contactsInstructions,
    tools: [upsertContactNoteTool],
};
