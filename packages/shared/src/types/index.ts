// Karen Ultra — Shared Entity Types

// ─── Base ────────────────────────────────────────────────────────────────────

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface User extends BaseEntity {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'user' | 'readonly';
  is_active: boolean;
  last_login_at: string | null;
  preferences: UserPreferences;
  metadata: Record<string, unknown>;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  notifications_enabled: boolean;
  voice_enabled: boolean;
  default_ai_provider?: string;
}

// ─── Conversation & Messages ──────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageChannel =
  | 'web'
  | 'whatsapp'
  | 'instagram'
  | 'telegram'
  | 'api'
  | 'voice';

export interface Message extends BaseEntity {
  conversation_id: string;
  role: MessageRole;
  content: string;
  channel: MessageChannel;
  user_id: string;
  ai_provider?: string;
  ai_model?: string;
  tokens_used?: number;
  latency_ms?: number;
  attachments?: MessageAttachment[];
  metadata?: Record<string, unknown>;
}

export interface MessageAttachment {
  type: 'image' | 'audio' | 'file' | 'link';
  url: string;
  filename?: string;
  size_bytes?: number;
  mime_type?: string;
}

export interface Conversation extends BaseEntity {
  user_id: string;
  title: string | null;
  channel: MessageChannel;
  is_archived: boolean;
  last_message_at: string | null;
  message_count: number;
  metadata?: Record<string, unknown>;
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export type ContactSource =
  | 'manual'
  | 'google'
  | 'whatsapp'
  | 'telegram'
  | 'instagram';

export interface Contact extends BaseEntity {
  user_id: string;
  display_name: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  company?: string;
  notes?: string;
  source: ContactSource;
  source_id?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

// ─── Memory ──────────────────────────────────────────────────────────────────

export type MemoryCategory =
  | 'personal'
  | 'work'
  | 'preference'
  | 'fact'
  | 'instruction'
  | 'reminder'
  | 'other';

export interface Memory extends BaseEntity {
  user_id: string;
  content: string;
  category: MemoryCategory;
  importance: 1 | 2 | 3 | 4 | 5;
  source?: string;
  tags: string[];
  expires_at?: string | null;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

// ─── Documents ───────────────────────────────────────────────────────────────

export type DocumentSource =
  | 'upload'
  | 'google_drive'
  | 'gmail'
  | 'web_scrape'
  | 'api';

export type DocumentStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'deleted';

export interface Document extends BaseEntity {
  user_id: string;
  title: string;
  content?: string;
  summary?: string;
  source: DocumentSource;
  source_url?: string;
  source_id?: string;
  mime_type?: string;
  size_bytes?: number;
  status: DocumentStatus;
  tags: string[];
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface DocumentChunk extends BaseEntity {
  document_id: string;
  content: string;
  chunk_index: number;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task extends BaseEntity {
  user_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string | null;
  completed_at?: string | null;
  assignee_id?: string | null;
  parent_task_id?: string | null;
  tags: string[];
  metadata?: Record<string, unknown>;
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export type ReminderStatus = 'pending' | 'sent' | 'dismissed' | 'failed';

export type ReminderChannel = 'web' | 'whatsapp' | 'telegram' | 'email';

export interface Reminder extends BaseEntity {
  user_id: string;
  title: string;
  description?: string;
  remind_at: string;
  recurrence?: string | null; // cron-like expression
  status: ReminderStatus;
  channel: ReminderChannel;
  metadata?: Record<string, unknown>;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'reminder'
  | 'ai_message'
  | 'system';

export interface Notification extends BaseEntity {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  channel: ReminderChannel;
  is_read: boolean;
  read_at?: string | null;
  action_url?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Automation Rules ─────────────────────────────────────────────────────────

export type AutomationTrigger =
  | 'message_received'
  | 'time_based'
  | 'email_received'
  | 'file_uploaded'
  | 'webhook'
  | 'manual';

export type AutomationAction =
  | 'send_message'
  | 'send_notification'
  | 'create_task'
  | 'update_memory'
  | 'call_webhook'
  | 'run_ai_prompt';

export interface AutomationRule extends BaseEntity {
  user_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  trigger: AutomationTrigger;
  trigger_config: Record<string, unknown>;
  action: AutomationAction;
  action_config: Record<string, unknown>;
  conditions?: AutomationCondition[];
  run_count: number;
  last_run_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AutomationCondition {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'regex';
  value: unknown;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export type AuditAction =
  | 'login'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'api_call'
  | 'permission_change';

export interface AuditLog extends BaseEntity {
  user_id: string;
  action: AuditAction;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

// ─── API Usage ────────────────────────────────────────────────────────────────

export interface ApiUsage extends BaseEntity {
  user_id: string;
  provider: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  request_type: string;
  latency_ms: number;
  success: boolean;
  error?: string | null;
}

// ─── Security Events ──────────────────────────────────────────────────────────

export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'password_change'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'suspicious_activity'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'rate_limit_exceeded';

export interface SecurityEvent extends BaseEntity {
  user_id?: string;
  event_type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  ip_address?: string;
  user_agent?: string;
  resolved: boolean;
  resolved_at?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export type IntegrationProvider =
  | 'google'
  | 'whatsapp'
  | 'instagram'
  | 'telegram'
  | 'elevenlabs'
  | 'gemini'
  | 'groq'
  | 'openai';

export type IntegrationStatus = 'active' | 'inactive' | 'error' | 'pending';

export interface Integration extends BaseEntity {
  user_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: Record<string, unknown>; // encrypted on server
  scopes?: string[];
  expires_at?: string | null;
  last_sync_at?: string | null;
  error?: string | null;
}

// ─── Calendar Events ──────────────────────────────────────────────────────────

export interface CalendarEvent extends BaseEntity {
  user_id: string;
  google_event_id?: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location?: string;
  attendees?: string[];
  recurrence?: string | null;
  calendar_id?: string;
  metadata?: Record<string, unknown>;
}

// ─── Email (Gmail) ────────────────────────────────────────────────────────────

export interface EmailMessage extends BaseEntity {
  user_id: string;
  gmail_message_id: string;
  thread_id?: string;
  from_address: string;
  to_addresses: string[];
  subject: string;
  snippet: string;
  body_text?: string;
  body_html?: string;
  received_at: string;
  is_read: boolean;
  labels: string[];
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  mime_type: string;
  size_bytes: number;
  attachment_id: string;
}

// ─── Voice Sessions ───────────────────────────────────────────────────────────

export interface VoiceSession extends BaseEntity {
  user_id: string;
  conversation_id: string;
  voice_id: string;
  provider: 'elevenlabs';
  duration_ms?: number;
  characters_used?: number;
  transcript?: string;
  audio_url?: string;
  metadata?: Record<string, unknown>;
}
