import type { SkillMeta } from '../types.js';

export const slideDecksMeta: SkillMeta = {
  name: 'slide-decks',
  description: 'Create branded .pptx PowerPoint presentations with title, content, two-column, and chart layouts, speaker notes, and structure verification.',
  triggerIntents: ['pptx', 'slides', 'slide deck', 'presentation', 'powerpoint', 'deck'],
  allowedAgentTools: ['create_slide_deck', 'read_slide_deck'],
  pageAffinity: ['/documents', '/drive', '/chat'],
  outputTypes: ['pptx'],
};

export const slideDecksInstructions = `# Slide Decks Skill
- Build clean, branded .pptx presentations using \`create_slide_deck\` (supports title, content, two-column, and bar/line chart slides + speaker notes).
- Never create empty slides. Keep bullets concise.
- \`create_slide_deck\` reopens the generated buffer with officeparser to verify text before returning success.
- Use \`read_slide_deck\` to inspect an existing .pptx file.`;
