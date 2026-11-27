export type RedisHealthState = 'healthy' | 'degraded' | 'disconnected' | 'misconfigured';

export type KarenQueueName =
  | 'ai-processing'
  | 'instagram-replies'
  | 'telegram-delivery'
  | 'newspaper-generation'
  | 'image-generation'
  | 'google-classroom-reminders'
  | 'google-sync'
  | 'notifications'
  | 'document-processing'
  | 'automation-execution'
  | 'webhook-processing';

export const KAREN_QUEUES: readonly KarenQueueName[] = [
  'ai-processing',
  'instagram-replies',
  'telegram-delivery',
  'newspaper-generation',
  'image-generation',
  'google-classroom-reminders',
  'google-sync',
  'notifications',
  'document-processing',
  'automation-execution',
  'webhook-processing',
] as const;

export interface RedisConfig {
  env: string;
  keyPrefix: string;
  restUrl: string;
  restToken: string;
  tcpUrl: string;
  tcpHost: string;
  tcpPort: number;
  tls: boolean;
  restConfigured: boolean;
  tcpConfigured: boolean;
}

export interface RedisHealthReport {
  status: RedisHealthState;
  restConfigured: boolean;
  tcpConfigured: boolean;
  bullmqCompatible: boolean;
  latencyMs: number | null;
  queues: readonly KarenQueueName[];
  error?: string;
}

export interface DistributedLockHandle {
  key: string;
  token: string;
  acquired: boolean;
}

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  resetAfterSec: number;
  backend: 'upstash-rest' | 'memory-fallback';
}
