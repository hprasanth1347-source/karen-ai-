import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { saveUserSetting } from '../../services/persistence.service.js';
import { docCoauthorInstructions, docCoauthorMeta } from './meta.js';
const saveCoauthoredInput = z.object({
    title: z.string().min(1).max(160),
    content: z.string().min(1).max(50000),
    stage: z.enum(['outline', 'draft', 'revised']).default('draft'),
});
export const saveCoauthoredDocTool = {
    name: 'save_coauthored_doc',
    description: 'Save or update a co-authored document in the Documents vault so edits continue across chats.',
    inputSchema: saveCoauthoredInput,
    async execute(args, ctx) {
        const supabase = supabaseAdmin;
        if (supabase && ctx.userId) {
            await supabase
                .from('documents')
                .upsert({
                user_id: ctx.userId,
                title: args.title,
                name: `${args.title}.md`,
                content_text: args.content,
                source: 'doc-coauthor',
                metadata: { stage: args.stage },
            }, { onConflict: 'user_id,name' })
                .then(() => { }, () => { });
        }
        await saveUserSetting(`coauthor_doc:${args.title.toLowerCase().slice(0, 60)}`, {
            title: args.title,
            stage: args.stage,
            content: args.content,
            updatedAt: new Date().toISOString(),
        }).catch(() => { });
        return {
            ok: true,
            summary: `Saved "${args.title}" (${args.stage}) to the Documents vault.`,
            data: { title: args.title, stage: args.stage },
        };
    },
};
export const docCoauthorSkill = {
    meta: docCoauthorMeta,
    instructions: docCoauthorInstructions,
    tools: [saveCoauthoredDocTool],
};
