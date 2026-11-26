import type { SkillModule } from '../types.js';
import { comfortModeSafeInstructions, comfortModeSafeMeta } from './meta.js';

export const comfortModeSafeSkill: SkillModule = {
  meta: comfortModeSafeMeta,
  instructions: comfortModeSafeInstructions,
  tools: [],
};
