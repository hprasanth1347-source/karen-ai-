import { z } from 'zod';
import { runLastMinuteExamPrep } from '../../services/classroom.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { examPrepInstructions, examPrepMeta } from './meta.js';

const examPrepInput = z.object({
  subject: z.string().min(1).max(120),
  hoursAvailable: z.number().min(0.5).max(168).default(6),
  language: z.enum(['english', 'thanglish']).default('english'),
  mode: z.enum(['plan', 'quiz', 'notes']).default('plan'),
});

export const runExamPrepPlanTool: SkillToolDefinition<z.infer<typeof examPrepInput>> = {
  name: 'run_exam_prep_plan',
  description: 'Generate an exam prep plan, quiz, or revision notes for a subject.',
  inputSchema: examPrepInput,
  async execute(args) {
    const prep = await runLastMinuteExamPrep({
      subject: args.subject,
      hoursAvailable: args.hoursAvailable,
      language: args.language,
      mode: args.mode === 'quiz' ? 'quiz' : 'plan',
    });
    return { ok: true, summary: `Generated exam prep (${args.mode}) for ${prep.subject}.`, data: prep };
  },
};

export const examPrepSkill: SkillModule = {
  meta: examPrepMeta,
  instructions: examPrepInstructions,
  tools: [runExamPrepPlanTool],
};
