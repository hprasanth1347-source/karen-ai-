import type { SkillMeta } from '../types.js';

export const classroomExplainerMeta: SkillMeta = {
  name: 'classroom-explainer',
  description: 'Explain Classroom assignments in English or Thanglish and prepare study-note drafts (never auto-submits).',
  triggerIntents: ['explain assignment', 'assignment draft', 'study notes', 'understand homework'],
  allowedAgentTools: ['explain_assignment_tool'],
  pageAffinity: ['/classroom', '/chat'],
  outputTypes: ['text'],
};

export const classroomExplainerInstructions = `# Classroom Explainer Skill
- Use \`explain_assignment_tool\` to fetch assignment details and break them down in English or Thanglish.
- Only prepare study-note drafts; never submit coursework automatically.`;
