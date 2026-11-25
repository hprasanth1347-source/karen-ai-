// Karen Ultra — Shared Zod Validators
import { z } from 'zod';

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof PaginationSchema>;

// ─── Chat / Message ───────────────────────────────────────────────────────────

export const SendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(32_000),
  conversation_id: z.string().uuid().optional(),
  channel: z.enum(['web', 'whatsapp', 'instagram', 'telegram', 'api', 'voice']).default('web'),
  attachments: z
    .array(
      z.object({
        type: z.enum(['image', 'audio', 'file', 'link']),
        url: z.string().url(),
        filename: z.string().optional(),
        mime_type: z.string().optional(),
      }),
    )
    .optional(),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// ─── Memory ───────────────────────────────────────────────────────────────────

export const CreateMemorySchema = z.object({
  content: z.string().min(1).max(10_000),
  category: z.enum(['personal', 'work', 'preference', 'fact', 'instruction', 'reminder', 'other']),
  importance: z.number().int().min(1).max(5).default(3),
  source: z.string().optional(),
  tags: z.array(z.string()).default([]),
  expires_at: z.string().datetime().optional().nullable(),
});

export type CreateMemoryInput = z.infer<typeof CreateMemorySchema>;

// ─── Contact ──────────────────────────────────────────────────────────────────

export const CreateContactSchema = z.object({
  display_name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  avatar_url: z.string().url().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  source: z.enum(['manual', 'google', 'whatsapp', 'telegram', 'instagram']).default('manual'),
  tags: z.array(z.string()).default([]),
});

export type CreateContactInput = z.infer<typeof CreateContactSchema>;

// ─── Task ─────────────────────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  due_date: z.string().datetime().optional().nullable(),
  tags: z.array(z.string()).default([]),
  parent_task_id: z.string().uuid().optional().nullable(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// ─── Reminder ────────────────────────────────────────────────────────────────

export const CreateReminderSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  remind_at: z.string().datetime(),
  recurrence: z.string().optional().nullable(),
  channel: z.enum(['web', 'whatsapp', 'telegram', 'email']).default('web'),
});

export type CreateReminderInput = z.infer<typeof CreateReminderSchema>;

// ─── Document ────────────────────────────────────────────────────────────────

export const UploadDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  source: z.enum(['upload', 'google_drive', 'gmail', 'web_scrape', 'api']).default('upload'),
  source_url: z.string().url().optional(),
  tags: z.array(z.string()).default([]),
});

export type UploadDocumentInput = z.infer<typeof UploadDocumentSchema>;

// ─── Automation Rule ──────────────────────────────────────────────────────────

export const CreateAutomationSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
  trigger: z.enum([
    'message_received',
    'time_based',
    'email_received',
    'file_uploaded',
    'webhook',
    'manual',
  ]),
  trigger_config: z.record(z.unknown()).default({}),
  action: z.enum([
    'send_message',
    'send_notification',
    'create_task',
    'update_memory',
    'call_webhook',
    'run_ai_prompt',
  ]),
  action_config: z.record(z.unknown()).default({}),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'regex']),
        value: z.unknown(),
      }),
    )
    .optional(),
});

export type CreateAutomationInput = z.infer<typeof CreateAutomationSchema>;

// ─── Search ───────────────────────────────────────────────────────────────────

export const SearchSchema = z.object({
  query: z.string().min(1).max(1000),
  scope: z
    .array(z.enum(['messages', 'memories', 'documents', 'contacts', 'tasks']))
    .default(['messages', 'memories', 'documents']),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type SearchInput = z.infer<typeof SearchSchema>;

// ─── Webhook ──────────────────────────────────────────────────────────────────

export const WhatsAppWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.record(z.unknown())),
});

export const TelegramWebhookSchema = z.object({
  update_id: z.number(),
  message: z.record(z.unknown()).optional(),
  callback_query: z.record(z.unknown()).optional(),
});
