import { z } from 'zod';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { thanglishWriterInstructions, thanglishWriterMeta } from './meta.js';

const thanglishInput = z.object({
  draft: z.string().min(1).max(4000),
  language: z.enum(['thanglish', 'tamil', 'english']).default('thanglish'),
  tone: z.enum(['casual', 'polite', 'professional', 'warm']).default('casual'),
});

export const formatThanglishDraftTool: SkillToolDefinition<z.infer<typeof thanglishInput>> = {
  name: 'format_thanglish_draft',
  description: 'Record a structured Thanglish/Tamil/English draft with language and tone metadata.',
  inputSchema: thanglishInput,
  async execute(args) {
    return {
      ok: true,
      summary: `Prepared ${args.language} draft (${args.tone} tone).`,
      data: args,
    };
  },
};

export const thanglishWriterSkill: SkillModule = {
  meta: thanglishWriterMeta,
  instructions: thanglishWriterInstructions,
  tools: [formatThanglishDraftTool],
};
