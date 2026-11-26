import { z } from 'zod';
import { addTask } from '../../services/task.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { taskPlannerInstructions, taskPlannerMeta } from './meta.js';

const createTaskInput = z.object({
  title: z.string().min(1).max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const createPlannedTaskTool: SkillToolDefinition<z.infer<typeof createTaskInput>> = {
  name: 'create_planned_task',
  description: 'Create a task with optional due date and priority.',
  inputSchema: createTaskInput,
  async execute(args) {
    const task = await addTask(args.title, args.dueDate, args.priority, 'task_planner');
    return { ok: true, summary: `Created task "${task.title}" (${task.priority}).`, data: task };
  },
};

export const taskPlannerSkill: SkillModule = {
  meta: taskPlannerMeta,
  instructions: taskPlannerInstructions,
  tools: [createPlannedTaskTool],
};
