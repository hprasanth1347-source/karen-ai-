import type { SkillMeta } from '../types.js';

export const instagramCommentsMeta: SkillMeta = {
  name: 'instagram-comments',
  description: 'Classify Instagram comments, draft public replies, flag spam, and queue private DM replies for leads.',
  triggerIntents: ['instagram comments', 'comment reply', 'hide spam', 'comment lead'],
  allowedAgentTools: ['queue_comment_lead_dm'],
  pageAffinity: ['/instagram', '/chat'],
  outputTypes: ['approval', 'text'],
};

export const instagramCommentsInstructions = `# Instagram Comments Skill
- Categorize comments into Lead, Question, Praise, or Spam.
- For leads, queue a private DM follow-up via \`queue_comment_lead_dm\` (approval required).`;
