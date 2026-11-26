import type { SkillMeta } from '../types.js';

export const meetingNotesMeta: SkillMeta = {
  name: 'meeting-notes',
  description: 'Convert meeting notes into structured summaries, decisions, and actionable tasks.',
  triggerIntents: ['meeting notes', 'minutes of meeting', 'action items', 'call summary', 'turn notes into tasks'],
  allowedAgentTools: ['create_meeting_action_task'],
  pageAffinity: ['/tasks', '/documents', '/chat'],
  outputTypes: ['task', 'text'],
};

export const meetingNotesInstructions = `# Meeting Notes Skill
- Extract Decisions, Key Discussion Points, and Action Items from meeting notes.
- Create tasks for action items using \`create_meeting_action_task\`.`;
