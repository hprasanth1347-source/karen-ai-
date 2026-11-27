import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';

export interface JobRecord {
  id: string;
  userId?: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string;
  lastError?: string;
}

const memoryQueue = new Map<string, JobRecord>();

export async function enqueueJob(input: {
  userId?: string;
  type: string;
  payload: Record<string, unknown>;
  runAt?: string;
  maxAttempts?: number;
  idempotencyKey?: string;
}): Promise<JobRecord> {
  if (input.idempotencyKey) {
    for (const existing of memoryQueue.values()) {
      if (existing.idempotencyKey === input.idempotencyKey) return existing;
    }
  }

  const id = crypto.randomUUID();
  const job: JobRecord = {
    id,
    userId: input.userId,
    type: input.type,
    payload: input.payload,
    status: 'queued',
    runAt: input.runAt || new Date().toISOString(),
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 5,
    idempotencyKey: input.idempotencyKey,
  };
  memoryQueue.set(id, job);

  await supabaseAdmin
    .from('jobs')
    .upsert(
      {
        id,
        user_id: input.userId || null,
        type: input.type,
        payload: input.payload,
        status: 'queued',
        run_at: job.runAt,
        max_attempts: job.maxAttempts,
        idempotency_key: input.idempotencyKey || null,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    )
    .then(() => { }, (err) => logger.debug('Job DB enqueue fallback', { err }));

  return job;
}

export async function markJobCompleted(jobId: string): Promise<void> {
  const j = memoryQueue.get(jobId);
  if (j) j.status = 'succeeded';
  await supabaseAdmin
    .from('jobs')
    .update({ status: 'succeeded', finished_at: new Date().toISOString(), locked_by: null, locked_at: null })
    .eq('id', jobId)
    .then(() => { }, () => { });
}

export async function markJobFailed(jobId: string, attempts: number, maxAttempts: number, errMsg: string): Promise<void> {
  const nextAttempts = attempts + 1;
  const dead = nextAttempts >= maxAttempts;
  const backoffSec = Math.min(300, Math.pow(2, nextAttempts) * 5);
  const nextRunAt = new Date(Date.now() + backoffSec * 1000).toISOString();

  const j = memoryQueue.get(jobId);
  if (j) {
    j.attempts = nextAttempts;
    j.status = dead ? 'dead' : 'queued';
    j.lastError = errMsg.slice(0, 300);
    j.runAt = nextRunAt;
  }

  await supabaseAdmin
    .from('jobs')
    .update({
      attempts: nextAttempts,
      status: dead ? 'dead' : 'queued',
      run_at: nextRunAt,
      last_error: errMsg.slice(0, 300),
      locked_by: null,
      locked_at: null,
      ...(dead ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq('id', jobId)
    .then(() => { }, () => { });
}
