export const examPrepMeta = {
    name: 'exam-prep',
    description: 'Generate revision notes, quizzes, mock tests, and last-minute cram plans from Classroom or Drive study material.',
    triggerIntents: ['exam prep', 'mock test', 'quiz me', 'revision notes', 'cram', 'exam tomorrow'],
    allowedAgentTools: ['run_exam_prep_plan'],
    pageAffinity: ['/classroom', '/documents', '/chat'],
    outputTypes: ['text'],
};
export const examPrepInstructions = `# Exam Prep Skill
- Call \`run_exam_prep_plan\` for focused revision notes, quizzes, or last-minute cram plans.`;
