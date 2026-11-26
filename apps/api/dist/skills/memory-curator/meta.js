export const memoryCuratorMeta = {
    name: 'memory-curator',
    description: 'Propose, deduplicate, and store durable personal memories; ask before saving sensitive facts.',
    triggerIntents: ['remember that', 'save memory', 'my preference', 'dont forget', 'note about me'],
    allowedAgentTools: ['save_curated_memory'],
    pageAffinity: ['/memory', '/chat'],
    outputTypes: ['memory', 'text'],
};
export const memoryCuratorInstructions = `# Memory Curator Skill
- Check if a fact is durable and non-sensitive before calling \`save_curated_memory\`.
- If the fact is sensitive (ID numbers, passwords, medical, financial), ask the owner before saving.`;
