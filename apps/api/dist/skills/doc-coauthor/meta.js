export const docCoauthorMeta = {
    name: 'doc-coauthor',
    description: 'Collaborative outline, draft, and revision loop saved to the Documents vault so edits continue across chats.',
    triggerIntents: ['coauthor', 'outline', 'draft doc', 'revise document', 'write proposal'],
    allowedAgentTools: ['save_coauthored_doc'],
    pageAffinity: ['/documents', '/chat'],
    outputTypes: ['document', 'text'],
};
export const docCoauthorInstructions = `# Doc Co-Author Skill
- Guide the owner through Outline -> Draft -> Revise.
- Persist each draft via \`save_coauthored_doc\` so it is available in the Documents menu across sessions.`;
