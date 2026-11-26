import { z } from 'zod';
import { listTasks } from '../../services/task.service.js';
import { getGoogleContextForPrompt } from '../../routes/googleDrive.js';
import { listClassroomAssignments } from '../../services/classroom.service.js';
import { wrapUntrustedContent } from '../../services/actionPolicy.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { dailyBriefingInstructions, dailyBriefingMeta } from './meta.js';

export const collectDailyBriefingTool: SkillToolDefinition<Record<string, never>> = {
  name: 'collect_daily_briefing',
  description: 'Collect active tasks, Classroom deadlines, and Gmail highlights for a daily briefing.',
  inputSchema: z.object({}),
  async execute() {
    const [tasks, assignments, gmail] = await Promise.all([
      listTasks().catch(() => []),
      listClassroomAssignments({ category: 'pending' }).catch(() => []),
      getGoogleContextForPrompt('unread important emails today').catch(() => ''),
    ]);
    const activeTasks = tasks.filter((t) => t.status !== 'done').slice(0, 10);
    return {
      ok: true,
      summary: `Collected ${activeTasks.length} tasks and ${assignments.length} pending Classroom assignments.`,
      data: {
        activeTasks,
        pendingAssignments: assignments.slice(0, 8),
        gmailContext: gmail ? wrapUntrustedContent('gmail', gmail) : '',
      },
    };
  },
};

export const dailyBriefingSkill: SkillModule = {
  meta: dailyBriefingMeta,
  instructions: dailyBriefingInstructions,
  tools: [collectDailyBriefingTool],
};
