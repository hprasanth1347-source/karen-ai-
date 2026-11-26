import type { SkillMeta } from '../types.js';

export const instagramContentMeta: SkillMeta = {
  name: 'instagram-content',
  description: 'Generate Instagram captions, hashtags, Reel ideas, and content schedules, queuing posts as tasks/approvals.',
  triggerIntents: ['instagram caption', 'reel idea', 'hashtags', 'content calendar', 'post schedule'],
  allowedAgentTools: ['queue_instagram_post_task'],
  pageAffinity: ['/instagram', '/chat'],
  outputTypes: ['task', 'text'],
};

export const instagramContentInstructions = `# Instagram Content Skill
- Draft engaging captions, targeted hashtags, and Reel hooks in the owner's brand tone.
- Use \`queue_instagram_post_task\` to schedule content reminders.`;
