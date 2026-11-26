import { z } from 'zod';
import { explainClassroomAssignment } from '../../services/classroom.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { classroomExplainerInstructions, classroomExplainerMeta } from './meta.js';

const explainInput = z.object({
  query: z.string().min(1).max(400),
  language: z.enum(['english', 'thanglish']).default('english'),
});

export const explainAssignmentTool: SkillToolDefinition<z.infer<typeof explainInput>> = {
  name: 'explain_assignment_tool',
  description: 'Explain a Classroom assignment in English or Thanglish.',
  inputSchema: explainInput,
  async execute(args) {
    const res = await explainClassroomAssignment(args.query, args.language);
    return { ok: true, summary: `Explained assignment in ${args.language}.`, data: res };
  },
};

export const classroomExplainerSkill: SkillModule = {
  meta: classroomExplainerMeta,
  instructions: classroomExplainerInstructions,
  tools: [explainAssignmentTool],
};
