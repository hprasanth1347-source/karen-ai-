import type { SkillMeta } from '../types.js';

export const contactsMeta: SkillMeta = {
  name: 'contacts',
  description: 'Deduplicate contacts, track VIP rules, and store per-contact notes used by DM and email skills.',
  triggerIntents: ['contact', 'vip contact', 'save contact', 'find contact', 'phone number', 'email address of'],
  allowedAgentTools: ['upsert_contact_note'],
  pageAffinity: ['/contacts', '/instagram', '/gmail', '/chat'],
  outputTypes: ['memory', 'text'],
};

export const contactsInstructions = `# Contacts Skill
- Store or look up VIP status and per-contact notes via \`upsert_contact_note\` so DM and email skills use accurate handles and tone.`;
