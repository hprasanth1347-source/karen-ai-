import { z } from 'zod';
import { addMemory } from '../../services/memory.service.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { memoryCuratorInstructions, memoryCuratorMeta } from './meta.js';

const saveMemoryInput = z.object({
  content: z.string().min(3).max(500),
  category: z.enum(['personal', 'work', 'preference', 'fact', 'instruction', 'other']).default('personal'),
});

export const saveCuratedMemoryTool: SkillToolDefinition<z.infer<typeof saveMemoryInput>> = {
  name: 'save_curated_memory',
  description: 'Save a durable, deduplicated memory entry.',
  inputSchema: saveMemoryInput,
  async execute(args) {
    const saved = await addMemory(args.content, args.category, undefined, 'user_confirmed');
    return { ok: true, summary: `Saved memory: "${saved.content}".`, data: saved };
  },
};

export const memoryCuratorSkill: SkillModule = {
  meta: memoryCuratorMeta,
  instructions: memoryCuratorInstructions,
  tools: [saveCuratedMemoryTool],
};
