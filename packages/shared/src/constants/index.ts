// Karen Ultra — Shared Constants

// ─── AI Providers ─────────────────────────────────────────────────────────────

export const AI_PROVIDERS = {
  GEMINI: 'gemini',
  GROQ: 'groq',
  OPENAI: 'openai',
} as const;

export type AiProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

export const AI_MODELS = {
  GEMINI: {
    FLASH_2: 'gemini-2.0-flash',
    FLASH_15: 'gemini-1.5-flash',
    PRO_15: 'gemini-1.5-pro',
  },
  GROQ: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
    LLAMA_8B: 'llama-3.1-8b-instant',
    MIXTRAL: 'mixtral-8x7b-32768',
  },
} as const;

// ─── Voice Providers ──────────────────────────────────────────────────────────

export const VOICE_PROVIDERS = {
  ELEVENLABS: 'elevenlabs',
} as const;

export type VoiceProvider = (typeof VOICE_PROVIDERS)[keyof typeof VOICE_PROVIDERS];

export const VOICE_LANGUAGE_CODES = {
  EN_IN: 'en-IN',
  EN_US: 'en-US',
  EN_GB: 'en-GB',
  HI_IN: 'hi-IN',
} as const;

// ─── Integration Providers ───────────────────────────────────────────────────

export const INTEGRATION_PROVIDERS = {
  GOOGLE: 'google',
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram',
  TELEGRAM: 'telegram',
  ELEVENLABS: 'elevenlabs',
  GEMINI: 'gemini',
  GROQ: 'groq',
  OPENAI: 'openai',
} as const;

export type IntegrationProviderKey = keyof typeof INTEGRATION_PROVIDERS;

// ─── Permission Levels ────────────────────────────────────────────────────────

export const PERMISSION_LEVELS = {
  OWNER: 'owner',
  ADMIN: 'admin',
  USER: 'user',
  READONLY: 'readonly',
} as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[keyof typeof PERMISSION_LEVELS];

export const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  owner: 100,
  admin: 50,
  user: 10,
  readonly: 1,
};

// ─── Task Priorities ──────────────────────────────────────────────────────────

export const TASK_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type TaskPriorityKey = keyof typeof TASK_PRIORITIES;

export const TASK_PRIORITY_ORDER: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ─── Notification Channels ────────────────────────────────────────────────────

export const NOTIFICATION_CHANNELS = {
  WEB: 'web',
  WHATSAPP: 'whatsapp',
  TELEGRAM: 'telegram',
  EMAIL: 'email',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

// ─── Message Channels ─────────────────────────────────────────────────────────

export const MESSAGE_CHANNELS = {
  WEB: 'web',
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram',
  TELEGRAM: 'telegram',
  API: 'api',
  VOICE: 'voice',
} as const;

export type MessageChannelKey = keyof typeof MESSAGE_CHANNELS;

// ─── Google OAuth Scopes ──────────────────────────────────────────────────────

export const GOOGLE_SCOPES = {
  PROFILE: 'https://www.googleapis.com/auth/userinfo.profile',
  EMAIL: 'https://www.googleapis.com/auth/userinfo.email',
  GMAIL_READONLY: 'https://www.googleapis.com/auth/gmail.readonly',
  GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_MODIFY: 'https://www.googleapis.com/auth/gmail.modify',
  DRIVE_READONLY: 'https://www.googleapis.com/auth/drive.readonly',
  DRIVE_FILE: 'https://www.googleapis.com/auth/drive.file',
  CALENDAR_READONLY: 'https://www.googleapis.com/auth/calendar.readonly',
  CALENDAR: 'https://www.googleapis.com/auth/calendar',
  CONTACTS_READONLY: 'https://www.googleapis.com/auth/contacts.readonly',
} as const;

// ─── API Rate Limits ──────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  AI_REQUESTS_PER_MINUTE: 60,
  AI_REQUESTS_PER_DAY: 2000,
  API_REQUESTS_PER_MINUTE: 300,
  WHATSAPP_MESSAGES_PER_SECOND: 10,
  TELEGRAM_MESSAGES_PER_SECOND: 30,
} as const;

// ─── File Upload Limits ───────────────────────────────────────────────────────

export const FILE_LIMITS = {
  MAX_SIZE_MB: 50,
  MAX_SIZE_BYTES: 50 * 1024 * 1024,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
  ],
} as const;

// ─── Pagination Defaults ──────────────────────────────────────────────────────

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// ─── Memory Configuration ─────────────────────────────────────────────────────

export const MEMORY_CONFIG = {
  MAX_MEMORIES_IN_CONTEXT: 10,
  SIMILARITY_THRESHOLD: 0.75,
  EMBEDDING_DIMENSION: 1536,
} as const;

// ─── API Version ──────────────────────────────────────────────────────────────

export const API_VERSION = 'v1' as const;
export const API_PREFIX = `/api/${API_VERSION}` as const;

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
