import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';

export interface PendingActionRecord {
  id: string;
  userId: string;
  actionType: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  preview: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
  expiresAt: string;
}

const memoryPending = new Map<string, PendingActionRecord>();

function hashPayload(payload: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function createPendingAction(input: {
  userId: string;
  actionType: string;
  payload: Record<string, unknown>;
  preview: string;
  ttlMinutes?: number;
}): Promise<PendingActionRecord> {
  const id = crypto.randomUUID();
  const payloadHash = hashPayload(input.payload);
  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 15) * 60 * 1000).toISOString();
  const record: PendingActionRecord = {
    id,
    userId: input.userId,
    actionType: input.actionType,
    payload: input.payload,
    payloadHash,
    preview: input.preview,
    status: 'pending',
    expiresAt,
  };
  memoryPending.set(id, record);

  await supabaseAdmin
    .from('pending_actions')
    .insert({
      id,
      user_id: input.userId,
      action_type: input.actionType,
      payload: input.payload,
      payload_hash: payloadHash,
      preview: input.preview,
      status: 'pending',
      expires_at: expiresAt,
    })
    .then(() => { }, () => { });

  return record;
}

export async function approvePendingAction(
  id: string,
  userId: string
): Promise<{ ok: boolean; action?: PendingActionRecord; error?: string }> {
  let rec = memoryPending.get(id);
  if (!rec) {
    const { data } = await supabaseAdmin
      .from('pending_actions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      rec = {
        id: data.id,
        userId: data.user_id,
        actionType: data.action_type,
        payload: data.payload,
        payloadHash: data.payload_hash,
        preview: data.preview,
        status: data.status,
        expiresAt: data.expires_at,
      };
    }
  }

  if (!rec || rec.userId !== userId) {
    return { ok: false, error: 'Pending action not found' };
  }
  if (rec.status !== 'pending') {
    return { ok: false, error: `Action already ${rec.status}` };
  }
  if (new Date(rec.expiresAt).getTime() < Date.now()) {
    rec.status = 'expired';
    return { ok: false, error: 'Confirmation expired' };
  }
  if (hashPayload(rec.payload) !== rec.payloadHash) {
    return { ok: false, error: 'Payload integrity check failed' };
  }

  rec.status = 'executed';
  memoryPending.set(id, rec);
  await supabaseAdmin
    .from('pending_actions')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .then(() => { }, () => { });

  return { ok: true, action: rec };
}

export async function rejectPendingAction(id: string, userId: string): Promise<boolean> {
  const rec = memoryPending.get(id);
  if (rec && rec.userId === userId) {
    rec.status = 'rejected';
  }
  const { error } = await supabaseAdmin
    .from('pending_actions')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('user_id', userId);
  return !error || Boolean(rec);
}
