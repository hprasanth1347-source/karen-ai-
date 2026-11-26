export const dailyBriefingMeta = {
    name: 'daily-briefing',
    description: 'Aggregate tasks, Gmail, Classroom deadlines, Instagram DMs, and schedule into a daily briefing.',
    triggerIntents: ['daily briefing', 'morning briefing', 'what is on my plate today', 'digest', 'today summary'],
    allowedAgentTools: ['collect_daily_briefing'],
    pageAffinity: ['/overview', '/telegram', '/chat'],
    outputTypes: ['text'],
};
export const dailyBriefingInstructions = `# Daily Briefing Skill
- Call \`collect_daily_briefing\` to gather tasks, Gmail, Classroom deadlines, and Instagram DM summary, then present a crisp priority-ordered briefing.`;
