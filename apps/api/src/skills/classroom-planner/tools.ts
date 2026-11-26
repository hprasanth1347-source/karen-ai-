import { z } from 'zod';
import { listClassroomAssignments } from '../../services/classroom.service.js';
import { wrapUntrustedContent } from '../../services/actionPolicy.service.js';
import { addTask } from '../../services/task.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { classroomPlannerInstructions, classroomPlannerMeta } from './meta.js';

export const listClassroomDeadlinesTool: SkillToolDefinition<{ category?: 'pending' | 'all' }> = {
  name: 'list_classroom_deadlines',
  description: 'List pending or all Google Classroom assignments with due dates.',
  inputSchema: z.object({ category: z.enum(['pending', 'all']).default('pending') }),
  async execute(args) {
    const items = await listClassroomAssignments({ category: args.category }).catch(() => []);
    return {
      ok: true,
      summary: `Loaded ${items.length} ${args.category} Classroom assignment(s).`,
      data: { context: wrapUntrustedContent('classroom', JSON.stringify(items.slice(0, 20))) },
    };
  },
};

export const createStudyReminderTaskTool: SkillToolDefinition<{
  title: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}> = {
  name: 'create_study_reminder_task',
  description: 'Create a prioritized assignment/study reminder task.',
  inputSchema: z.object({
    title: z.string().min(1).max(200),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('high'),
  }),
  async execute(args) {
    const task = await addTask(args.title, args.dueDate, args.priority, 'classroom_planner');
    return { ok: true, summary: `Created study reminder "${task.title}".`, data: { taskId: task.id } };
  },
};

export const classroomPlannerSkill: SkillModule = {
  meta: classroomPlannerMeta,
  instructions: classroomPlannerInstructions,
  tools: [listClassroomDeadlinesTool, createStudyReminderTaskTool],
};
