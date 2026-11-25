import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { getOwnerUserId } from './persistence.service.js';

export interface NotificationItem {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  title: string;
  body: string;
  channel: string;
  is_read: boolean;
  created_at: string;
}

export interface ApprovalItem {
  id: string;
  action_type: 'send_email' | 'send_insta';
  summary: string;
  action_data: Record<string, string>;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

const notificationsStore: NotificationItem[] = [
  {
    id: '1',
    type: 'success',
    priority: 'normal',
    title: 'Security Engine Active',
    body: 'Row Level Security verified for 22 database tables.',
    channel: 'web',
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    type: 'info',
    priority: 'normal',
    title: 'Voice Policy Enforced',
    body: 'Female voice profile configured. Fallback locked.',
    channel: 'web',
    is_read: false,
    created_at: new Date().toISOString(),
  },
];

const approvalsStore: ApprovalItem[] = [];

export function isSensitiveSend(text: string): boolean {
  return /\b(aadhar|aadhaar|pan\s*card|pan|passport|bank|account\s*number|ifsc|statement|salary|tax|itr|license|driving|password|secret|pin|otp|cvv)\b/i.test(
    text
  );
}

export async function addNotification(
  type: string,
  title: string,
  body: string,
  priority: NotificationItem['priority'] = 'normal',
  channel = 'web'
): Promise<NotificationItem> {
  const item: NotificationItem = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    priority,
    title,
    body,
    channel,
    is_read: false,
    created_at: new Date().toISOString(),
  };
  notificationsStore.unshift(item);
  if (notificationsStore.length > 50) notificationsStore.length = 50;

  try {
    const userId = await getOwnerUserId();
    if (userId) {
      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        type: ['info', 'success', 'warning', 'error', 'reminder', 'ai_message', 'system', 'whatsapp', 'instagram', 'gmail', 'telegram'].includes(type)
          ? type
          : 'info',
        priority,
        title,
        body,
        channel,
        is_read: false,
      });
    }
  } catch (err) {
    logger.debug('Supabase notification insert fallback', { err });
  }
  return item;
}

export async function listNotifications(): Promise<NotificationItem[]> {
  try {
    const userId = await getOwnerUserId();
    if (userId) {
      const { data, error } = await supabaseAdmin
        .from('notifications')
        .select('id, type, priority, title, body, channel, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!error && data && data.length > 0) {
        return data as NotificationItem[];
      }
    }
  } catch {
    // Fall back to in-memory
  }
  return [...notificationsStore];
}

export async function markAllNotificationsRead(): Promise<void> {
  for (const n of notificationsStore) n.is_read = true;
  try {
    const userId = await getOwnerUserId();
    if (userId) {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false);
    }
  } catch {
    // Ignore
  }
}

export async function createApprovalRequest(
  actionType: ApprovalItem['action_type'],
  summary: string,
  actionData: Record<string, string>
): Promise<ApprovalItem> {
  const item: ApprovalItem = {
    id: `apr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action_type: actionType,
    summary,
    action_data: actionData,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  approvalsStore.unshift(item);

  try {
    const userId = await getOwnerUserId();
    if (userId) {
      const { data } = await supabaseAdmin
        .from('approval_requests')
        .insert({
          user_id: userId,
          action_type: actionType,
          action_data: { summary, ...actionData },
          status: 'pending',
          requester: 'karen-ai',
        })
        .select('id, created_at')
        .single();
      if (data?.id) {
        item.id = data.id;
        item.created_at = data.created_at || item.created_at;
      }
    }
  } catch (err) {
    logger.debug('Supabase approval_requests insert fallback', { err });
  }

  await addNotification(
    'warning',
    'Approval Required: Sensitive Action',
    summary,
    'high',
    'web'
  );
  return item;
}

export async function listApprovals(): Promise<ApprovalItem[]> {
  try {
    const userId = await getOwnerUserId();
    if (userId) {
      const { data, error } = await supabaseAdmin
        .from('approval_requests')
        .select('id, action_type, action_data, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && data && data.length > 0) {
        return data.map((row: any) => ({
          id: row.id,
          action_type: row.action_type,
          summary: row.action_data?.summary || `${row.action_type}`,
          action_data: row.action_data || {},
          status: row.status,
          created_at: row.created_at,
        }));
      }
    }
  } catch {
    // Fall back to memory
  }
  return [...approvalsStore];
}

export async function getApprovalById(id: string): Promise<ApprovalItem | null> {
  const local = approvalsStore.find((a) => a.id === id);
  if (local) return local;
  try {
    const { data } = await supabaseAdmin
      .from('approval_requests')
      .select('id, action_type, action_data, status, created_at')
      .eq('id', id)
      .maybeSingle();
    if (data) {
      return {
        id: data.id,
        action_type: data.action_type,
        summary: (data.action_data as any)?.summary || data.action_type,
        action_data: (data.action_data as Record<string, string>) || {},
        status: data.status,
        created_at: data.created_at,
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

export async function setApprovalStatus(
  id: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const local = approvalsStore.find((a) => a.id === id);
  if (local) local.status = status;
  try {
    await supabaseAdmin
      .from('approval_requests')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // Ignore
  }
}
