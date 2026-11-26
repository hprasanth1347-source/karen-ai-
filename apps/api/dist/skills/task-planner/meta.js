export const taskPlannerMeta = {
    name: 'task-planner',
    description: 'Break goals into prioritized tasks, due dates, and reminders.',
    triggerIntents: ['add task', 'create task', 'plan my week', 'todo', 'remind me', 'break down goal'],
    allowedAgentTools: ['create_planned_task'],
    pageAffinity: ['/tasks', '/reminders', '/chat'],
    outputTypes: ['task', 'text'],
};
export const taskPlannerInstructions = `# Task Planner Skill
- Decompose goals into concrete, actionable tasks with due dates and priorities using \`create_planned_task\`.`;
