import { z } from 'zod';

export type SkillOutputType =
  | 'text'
  | 'docx'
  | 'pdf'
  | 'pptx'
  | 'xlsx'
  | 'approval'
  | 'task'
  | 'memory'
  | 'document';

export interface BrandSettings {
  brandName: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  tone: string;
}

export const DEFAULT_BRAND_SETTINGS: BrandSettings = {
  brandName: 'Hari Prasath / Karen AI',
  primaryColor: '#1E293B',
  accentColor: '#E11D48',
  backgroundColor: '#FFFDF7',
  textColor: '#0F172A',
  headingFont: 'Calibri',
  bodyFont: 'Calibri',
  tone: 'Clear, sharp, warm, and practical',
};

export interface SkillMeta {
  name: string;
  description: string;
  triggerIntents: string[];
  allowedAgentTools: string[];
  pageAffinity: string[];
  outputTypes: SkillOutputType[];
}

export interface GeneratedSkillFile {
  name: string;
  mimeType: string;
  url: string;
  sizeBytes: number;
  storagePath?: string;
}

export interface SkillToolContext {
  userId?: string;
  currentPage?: string;
  brand: BrandSettings;
  loveMode?: boolean;
}

export interface SkillToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  files?: GeneratedSkillFile[];
  pendingApproval?: { id: string; summary: string };
  error?: string;
}

export interface SkillToolDefinition<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, any>;
  execute: (args: TInput, ctx: SkillToolContext) => Promise<SkillToolResult>;
}

export interface SkillModule {
  meta: SkillMeta;
  instructions: string;
  tools: Array<SkillToolDefinition<any>>;
}
