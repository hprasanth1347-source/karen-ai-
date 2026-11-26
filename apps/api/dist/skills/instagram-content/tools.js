import { z } from 'zod';
import { addTask } from '../../services/task.service.js';
import { instagramContentInstructions, instagramContentMeta } from './meta.js';
const queuePostInput = z.object({
    title: z.string().min(1).max(160),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    caption: z.string().min(1).max(2200),
});
export const queueInstagramPostTaskTool = {
    name: 'queue_instagram_post_task',
    description: 'Schedule an Instagram post/Reel draft as an owner task.',
    inputSchema: queuePostInput,
    async execute(args) {
        const task = await addTask(`IG Post: ${args.title}`, args.dueDate, 'medium', 'instagram_content');
        return {
            ok: true,
            summary: `Scheduled Instagram content task "${task.title}".`,
            data: { taskId: task.id, caption: args.caption },
        };
    },
};
export const instagramContentSkill = {
    meta: instagramContentMeta,
    instructions: instagramContentInstructions,
    tools: [queueInstagramPostTaskTool],
};
