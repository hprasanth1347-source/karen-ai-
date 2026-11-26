export const whatsappAssistantMeta = {
    name: 'whatsapp-assistant',
    description: 'Draft WhatsApp messages and replies following WhatsApp Cloud API 24h window & template rules, with approval before sending.',
    triggerIntents: ['whatsapp', 'wa message', 'send whatsapp', 'whatsapp reply', 'whatsapp template'],
    allowedAgentTools: ['queue_whatsapp_approval'],
    pageAffinity: ['/whatsapp', '/chat'],
    outputTypes: ['approval', 'text'],
};
export const whatsappAssistantInstructions = `# WhatsApp Assistant Skill
- Enforce WhatsApp Cloud API rules: free-form text only within 24h of user's last message; otherwise use an approved template.
- Queue all WhatsApp sends for owner approval via \`queue_whatsapp_approval\`.`;
