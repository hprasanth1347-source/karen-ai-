import type { SkillMeta } from '../types.js';

export const thanglishWriterMeta: SkillMeta = {
  name: 'thanglish-writer',
  description: 'Draft or rewrite text in natural Thanglish, Tamil, or English with adjustable tone.',
  triggerIntents: ['thanglish', 'tamil', 'tanglish', 'da', 'machan', 'bro tamil', 'rewrite in thanglish'],
  allowedAgentTools: ['format_thanglish_draft'],
  pageAffinity: ['/instagram', '/whatsapp', '/chat'],
  outputTypes: ['text'],
};

export const thanglishWriterInstructions = `# Thanglish Writer Skill
- Rewrite or draft natural Thanglish (Tamil-English), Tamil, or English matching the requested tone (casual, polite, professional, warm).
- Keep phrasing authentic and concise.`;
