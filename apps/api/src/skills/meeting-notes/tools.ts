import { z } from 'zod';
import { addTask } from '../../services/task.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { meetingNotesInstructions, meetingNotesMeta } from './meta.js';

const actionTaskInput = z.object({
  title: z.string().min(1).max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const createMeetingActionTaskTool: SkillToolDefinition<z.infer<typeof actionTaskInput>> = {
  name: 'create_meeting_action_task',
  description: 'Convert a meeting action item into a tracked task.',
  inputSchema: actionTaskInput,
  async execute(args) {
    const task = await addTask(args.title, args.dueDate, args.priority, 'meeting_notes');
    return { ok: true, summary: `Created meeting action task "${task.title}".`, data: task };
  },
};

export const meetingNotesSkill: SkillModule = {
  meta: meetingNotesMeta,
  instructions: meetingNotesInstructions,
  tools: [createMeetingActionTaskTool],
};
