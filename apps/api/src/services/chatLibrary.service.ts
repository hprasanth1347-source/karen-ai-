/**
 * Karen Ultra – Chat Library Service
 * Persists all conversations and messages to Supabase (`conversations` & `messages` tables)
 * with graceful in-memory fallback when database is unavailable.
 */

import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { getOwnerUserId } from './persistence.service.js';
import { logger } from '../config/logger.js';

export interface ChatConversation {
  id: string;
  title: string;
  channel: 'web' | 'whatsapp' | 'instagram' | 'telegram' | 'api' | 'voice';
  message_count: number;
  last_message_at: string;
  created_at: string;
}

export interface StoredChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  channel: string;
  ai_provider?: string | null;
  ai_model?: string | null;
  created_at: string;
}

const memoryConversations: ChatConversation[] = [];
const memoryMessages = new Map<string, StoredChatMessage[]>();

async function resolveUserId(userId?: string): Promise<string | null> {
  if (userId) return userId;
  return await getOwnerUserId().catch(() => null);
}

export async function listConversations(
  userId?: string,
  channel?: ChatConversation['channel']
): Promise<ChatConversation[]> {
  const uid = await resolveUserId(userId);
  if (uid) {
    try {
      let query = supabaseAdmin
        .from('conversations')
        .select('id, title, channel, message_count, last_message_at, created_at')
        .eq('user_id', uid)
        .eq('is_archived', false)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100);

      if (channel) query = query.eq('channel', channel);

      const { data, error } = await query;
      if (!error && data) {
        return data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          title: String(row.title || 'New Chat'),
          channel: (row.channel as ChatConversation['channel']) || 'web',
          message_count: Number(row.message_count || 0),
          last_message_at: String(row.last_message_at || row.created_at || new Date().toISOString()),
          created_at: String(row.created_at || new Date().toISOString()),
        }));
      }
    } catch (err) {
      logger.debug('Supabase conversations read fallback', { err });
    }
  }

  return channel
    ? memoryConversations.filter((c) => c.channel === channel)
    : [...memoryConversations];
}

export async function createConversation(
  title = 'New Chat',
  channel: ChatConversation['channel'] = 'web',
  userId?: string
): Promise<ChatConversation> {
  const now = new Date().toISOString();
  const cleanTitle = title.trim().slice(0, 80) || 'New Chat';
  const uid = await resolveUserId(userId);

  if (uid) {
    try {
      const { data, error } = await supabaseAdmin
        .from('conversations')
        .insert({
          user_id: uid,
          title: cleanTitle,
          channel,
          last_message_at: now,
          message_count: 0,
        })
        .select('id, title, channel, message_count, last_message_at, created_at')
        .single();

      if (!error && data) {
        return {
          id: String(data.id),
          title: String(data.title || cleanTitle),
          channel: (data.channel as ChatConversation['channel']) || channel,
          message_count: Number(data.message_count || 0),
          last_message_at: String(data.last_message_at || now),
          created_at: String(data.created_at || now),
        };
      }
    } catch (err) {
      logger.debug('Supabase conversation insert fallback', { err });
    }
  }

  const local: ChatConversation = {
    id: randomUUID(),
    title: cleanTitle,
    channel,
    message_count: 0,
    last_message_at: now,
    created_at: now,
  };
  memoryConversations.unshift(local);
  memoryMessages.set(local.id, []);
  return local;
}

export async function getConversationMessages(
  conversationId: string,
  userId?: string
): Promise<StoredChatMessage[]> {
  const uid = await resolveUserId(userId);
  if (uid) {
    try {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .select('id, conversation_id, role, content, channel, ai_provider, ai_model, created_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', uid)
        .order('created_at', { ascending: true });

      if (!error && data) {
        return data as StoredChatMessage[];
      }
    } catch (err) {
      logger.debug('Supabase messages read fallback', { err });
    }
  }

  return [...(memoryMessages.get(conversationId) || [])];
}

export async function appendChatMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  meta?: { channel?: string; provider?: string; model?: string },
  userId?: string
): Promise<StoredChatMessage> {
  const now = new Date().toISOString();
  const channel = meta?.channel || 'web';
  const uid = await resolveUserId(userId);

  if (uid) {
    try {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          user_id: uid,
          role,
          content,
          channel,
          ai_provider: meta?.provider || null,
          ai_model: meta?.model || null,
        })
        .select('id, conversation_id, role, content, channel, ai_provider, ai_model, created_at')
        .single();

      if (!error && data) {
        const { count } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversationId);

        await supabaseAdmin
          .from('conversations')
          .update({
            last_message_at: now,
            message_count: count ?? 1,
            updated_at: now,
          })
          .eq('id', conversationId);

        return data as StoredChatMessage;
      }
    } catch (err) {
      logger.debug('Supabase message insert fallback', { err });
    }
  }

  const msg: StoredChatMessage = {
    id: randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    channel,
    ai_provider: meta?.provider || null,
    ai_model: meta?.model || null,
    created_at: now,
  };
  const list = memoryMessages.get(conversationId) || [];
  list.push(msg);
  memoryMessages.set(conversationId, list);

  const conv = memoryConversations.find((c) => c.id === conversationId);
  if (conv) {
    conv.last_message_at = now;
    conv.message_count = list.length;
  }
  return msg;
}

export async function deleteConversation(
  conversationId: string,
  userId?: string
): Promise<boolean> {
  const idx = memoryConversations.findIndex((c) => c.id === conversationId);
  if (idx !== -1) memoryConversations.splice(idx, 1);
  memoryMessages.delete(conversationId);

  const uid = await resolveUserId(userId);
  if (uid) {
    try {
      const { error } = await supabaseAdmin
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', uid);
      if (!error) return true;
    } catch (err) {
      logger.debug('Supabase conversation delete fallback', { err });
    }
  }
  return idx !== -1;
}
