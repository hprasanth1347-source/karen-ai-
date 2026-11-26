import type { SkillMeta } from '../types.js';

export const myBrandMeta: SkillMeta = {
  name: 'my-brand',
  description: "Owner's brand name, colors, fonts, and writing tone stored in Settings and applied automatically across document and writing skills.",
  triggerIntents: ['brand settings', 'brand colors', 'brand tone', 'my brand', 'update brand'],
  allowedAgentTools: ['get_brand_settings', 'update_brand_settings'],
  pageAffinity: ['/settings', '/documents'],
  outputTypes: ['text'],
};

export const myBrandInstructions = `# My Brand Skill
- Read or update the owner's brand identity (brandName, primaryColor, accentColor, backgroundColor, textColor, headingFont, bodyFont, tone).
- Every document and writing skill automatically receives these brand settings.`;
