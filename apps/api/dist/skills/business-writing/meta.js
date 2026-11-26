export const businessWritingMeta = {
    name: 'business-writing',
    description: "Draft status reports, newsletters, FAQs, announcements, and business emails in the owner's tone; outbound sends always queue for approval.",
    triggerIntents: ['status report', 'newsletter', 'faq', 'announcement', 'formal email', 'business email'],
    allowedAgentTools: ['queue_business_email_approval'],
    pageAffinity: ['/gmail', '/documents', '/chat'],
    outputTypes: ['text', 'approval'],
};
export const businessWritingInstructions = `# Business Writing Skill
- Write crisp, structured status reports, newsletters, FAQs, announcements, and emails matching the owner's brand tone.
- Whenever the owner wants to send a drafted email, call \`queue_business_email_approval\` so it creates an approval request rather than sending unapproved.`;
