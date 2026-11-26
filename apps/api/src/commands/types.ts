import { z } from 'zod';

export type CommandLanguage = 'english' | 'tamil' | 'thanglish';

export interface InlineActionButton {
  label: string;
  callbackData?: string;
  url?: string;
}

export interface LastResultItem {
  ordinal: number;
  type: 'assignment' | 'email' | 'drive_file' | 'dm_thread' | 'course' | 'task';
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
  extra?: Record<string, string>;
}

export interface UploadedFileRef {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  source: 'telegram' | 'web' | 'generated';
  uploadedAt: string;
  dataBase64?: string;
}

export interface PendingActionRecord {
  id: string;
  chatKey: string;
  userId?: string;
  actionType: string;
  payload: Record<string, unknown>;
  promptQuestion?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  expiresAt: string;
}

export interface CommandMacro {
  id: string;
  triggerPhrase: string;
  steps: Array<{ instruction: string }>;
  createdAt: string;
}

export interface CommandToolContext {
  chatKey: string;
  userId?: string;
  channel: 'telegram' | 'web';
  language: CommandLanguage;
  lastResults: LastResultItem[];
  lastUploadedFile?: UploadedFileRef | null;
}

export interface CommandToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  lastResults?: LastResultItem[];
  buttons?: InlineActionButton[][];
  pendingConfirmation?: {
    actionType: string;
    payload: Record<string, unknown>;
    previewText: string;
    buttons: InlineActionButton[][];
  };
  needsClarification?: {
    actionType: string;
    question: string;
    partialPayload: Record<string, unknown>;
  };
  errorCode?: string;
  fixButton?: InlineActionButton;
}

export interface CommandToolDef<TInput = Record<string, unknown>> {
  name: string;
  category: 'classroom' | 'gmail' | 'drive' | 'instagram' | 'tasks' | 'macros' | 'system';
  description: string;
  requiresConfirmation: boolean;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, any>;
  jsonSchema: Record<string, unknown>;
  execute: (args: TInput, ctx: CommandToolContext) => Promise<CommandToolResult>;
}

export interface CommandEngineResponse {
  handled: boolean;
  reply: string;
  buttons?: InlineActionButton[][];
  toolsUsed: string[];
  outcome: 'done' | 'needs_tap' | 'needs_clarification' | 'failed' | 'chat';
  lastResults?: LastResultItem[];
}
