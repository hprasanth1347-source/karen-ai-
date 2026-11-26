import type { SkillMeta } from '../types.js';

export const classroomPlannerMeta: SkillMeta = {
  name: 'classroom-planner',
  description: 'Turn Google Classroom deadlines into a prioritized plan with reminders (cram mode only for last-minute exams, no daily timetables).',
  triggerIntents: ['due this week', 'classroom deadlines', 'plan my assignments', 'pending assignments', 'exam week'],
  allowedAgentTools: ['list_classroom_deadlines', 'create_study_reminder_task'],
  pageAffinity: ['/classroom', '/tasks', '/chat'],
  outputTypes: ['task', 'text'],
};

export const classroomPlannerInstructions = `# Classroom Planner Skill
- Fetch pending assignments via \`list_classroom_deadlines\`.
- Prioritize by due date and effort, and create reminders via \`create_study_reminder_task\`.
- Never generate rigid daily hour-by-hour timetables; only use cram mode for urgent last-minute exams.`;
