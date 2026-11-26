/**
 * Karen AI – Chat Library Service
 * Persists all conversations and messages to Supabase (`conversations` & `messages` tables)
 * with graceful in-memory fallback when database is unavailable.
 */
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { ensureProfileRow, getOwnerUserId, loadUserSetting, saveUserSetting } from './persistence.service.js';
import { logger } from '../config/logger.js';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS_KEY = 'chat_library_v1';
const memoryConversations = [];
const memoryMessages = new Map();
async function resolveUserId(userId) {
    if (userId && UUID_REGEX.test(userId)) {
        await ensureProfileRow(userId);
        return userId;
    }
    const ownerId = await getOwnerUserId().catch(() => null);
    if (ownerId && UUID_REGEX.test(ownerId)) {
        await ensureProfileRow(ownerId);
        return ownerId;
    }
    return null;
}
async function readSettingsLibrary() {
    const saved = await loadUserSetting(SETTINGS_KEY);
    return {
        conversations: Array.isArray(saved?.conversations) ? saved.conversations : [],
        messages: saved?.messages && typeof saved.messages === 'object' ? saved.messages : {},
    };
}
async function writeSettingsLibrary(store) {
    // Keep up to 100 latest conversations in fallback store
    const trimmed = {
        conversations: store.conversations.slice(0, 100),
        messages: {},
    };
    for (const conv of trimmed.conversations) {
        trimmed.messages[conv.id] = (store.messages[conv.id] || []).slice(-200);
    }
    await saveUserSetting(SETTINGS_KEY, trimmed);
}
export async function listConversations(userId, channel, options) {
    const q = options?.q?.trim() || '';
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);
    const byId = new Map();
    const addItems = (items) => {
        for (const c of items) {
            if (channel && c.channel !== channel)
                continue;
            if (q && !c.title.toLowerCase().includes(q.toLowerCase()))
                continue;
            if (!byId.has(c.id))
                byId.set(c.id, c);
        }
    };
    const [uid, backup] = await Promise.all([
        resolveUserId(userId),
        readSettingsLibrary().catch(() => ({ conversations: [], messages: {} })),
    ]);
    addItems(backup.conversations);
    if (uid) {
        try {
            let query = supabaseAdmin
                .from('conversations')
                .select('id, title, channel, message_count, last_message_at, created_at')
                .eq('user_id', uid)
                .eq('is_archived', false)
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .range(offset, offset + limit - 1);
            if (channel)
                query = query.eq('channel', channel);
            if (q)
                query = query.ilike('title', `%${q}%`);
            const { data, error } = await query;
            if (!error && data) {
                addItems(data.map((row) => ({
                    id: String(row.id),
                    title: String(row.title || 'New Chat'),
                    channel: row.channel || 'web',
                    message_count: Number(row.message_count || 0),
                    last_message_at: String(row.last_message_at || row.created_at || new Date().toISOString()),
                    created_at: String(row.created_at || new Date().toISOString()),
                })));
            }
            else if (error) {
                logger.warn('Supabase conversations read failed, using user_settings/memory backup', { error });
            }
        }
        catch (err) {
            logger.warn('Supabase conversations read error', { err });
        }
    }
    addItems(memoryConversations);
    return Array.from(byId.values())
        .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
        .slice(0, limit);
}
export async function createConversation(title = 'New Chat', channel = 'web', userId) {
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
                    channel: data.channel || channel,
                    message_count: Number(data.message_count || 0),
                    last_message_at: String(data.last_message_at || now),
                    created_at: String(data.created_at || now),
                };
            }
            if (error) {
                logger.warn('Supabase conversation insert failed, persisting to user_settings backup', { error });
                const store = await readSettingsLibrary();
                const conv = {
                    id: randomUUID(),
                    title: cleanTitle,
                    channel,
                    message_count: 0,
                    last_message_at: now,
                    created_at: now,
                };
                store.conversations.unshift(conv);
                store.messages[conv.id] = [];
                await writeSettingsLibrary(store);
                return conv;
            }
        }
        catch (err) {
            logger.warn('Supabase conversation insert exception', { err });
        }
    }
    const local = {
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
export async function getConversationMessages(conversationId, userId, options) {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
    const before = options?.before;
    const uid = await resolveUserId(userId);
    if (uid) {
        try {
            // Verify conversation ownership before returning messages
            const { data: convRow } = await supabaseAdmin
                .from('conversations')
                .select('id, user_id')
                .eq('id', conversationId)
                .maybeSingle();
            if (convRow && convRow.user_id !== uid) {
                return [];
            }
            let query = supabaseAdmin
                .from('messages')
                .select('id, conversation_id, role, content, channel, ai_provider, ai_model, created_at')
                .eq('conversation_id', conversationId)
                .eq('user_id', uid)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (before) {
                query = query.lt('created_at', before);
            }
            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                return data.reverse();
            }
            const backup = await readSettingsLibrary();
            if (backup.messages[conversationId]?.length) {
                const list = before
                    ? backup.messages[conversationId].filter((m) => m.created_at < before)
                    : backup.messages[conversationId];
                return list.slice(-limit);
            }
            if (error) {
                logger.warn('Supabase messages read failed, checking user_settings backup', { error });
            }
        }
        catch (err) {
            logger.warn('Supabase messages read error', { err });
            const backup = await readSettingsLibrary().catch(() => ({ conversations: [], messages: {} }));
            if (backup.messages[conversationId]?.length)
                return backup.messages[conversationId].slice(-limit);
        }
    }
    return [...(memoryMessages.get(conversationId) || [])].slice(-limit);
}
export async function appendChatMessage(conversationId, role, content, meta, userId) {
    const now = new Date().toISOString();
    const channel = meta?.channel || 'web';
    const clientMessageId = meta?.clientMessageId?.trim() || undefined;
    const uid = await resolveUserId(userId);
    if (uid) {
        try {
            // Deduplicate by clientMessageId if already persisted
            if (clientMessageId) {
                const { data: existingMsg } = await supabaseAdmin
                    .from('messages')
                    .select('id, conversation_id, role, content, channel, ai_provider, ai_model, created_at')
                    .eq('conversation_id', conversationId)
                    .eq('user_id', uid)
                    .eq('client_message_id', clientMessageId)
                    .maybeSingle();
                if (existingMsg) {
                    return existingMsg;
                }
            }
            // Ensure parent conversation exists and belongs to uid
            const { data: convExists } = await supabaseAdmin
                .from('conversations')
                .select('id, user_id')
                .eq('id', conversationId)
                .maybeSingle();
            if (convExists && convExists.user_id !== uid) {
                throw new Error('Forbidden: conversation does not belong to authenticated user');
            }
            if (!convExists) {
                await supabaseAdmin.from('conversations').insert({
                    id: conversationId,
                    user_id: uid,
                    title: content.trim().slice(0, 60) || 'New Chat',
                    channel,
                    last_message_at: now,
                    message_count: 0,
                });
            }
            const insertPayload = {
                conversation_id: conversationId,
                user_id: uid,
                role,
                content,
                channel,
                ai_provider: meta?.provider || null,
                ai_model: meta?.model || null,
            };
            if (clientMessageId) {
                insertPayload.client_message_id = clientMessageId;
            }
            let { data, error } = await supabaseAdmin
                .from('messages')
                .insert(insertPayload)
                .select('id, conversation_id, role, content, channel, ai_provider, ai_model, created_at')
                .single();
            // If client_message_id column isn't migrated yet, retry without it
            if (error && clientMessageId && /client_message_id/i.test(error.message || '')) {
                delete insertPayload.client_message_id;
                const retry = await supabaseAdmin
                    .from('messages')
                    .insert(insertPayload)
                    .select('id, conversation_id, role, content, channel, ai_provider, ai_model, created_at')
                    .single();
                data = retry.data;
                error = retry.error;
            }
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
                    .eq('id', conversationId)
                    .eq('user_id', uid);
                return data;
            }
            if (error) {
                logger.warn('Supabase message insert failed, saving to user_settings backup', { error });
                const store = await readSettingsLibrary();
                const msg = {
                    id: randomUUID(),
                    conversation_id: conversationId,
                    role,
                    content,
                    channel,
                    ai_provider: meta?.provider || null,
                    ai_model: meta?.model || null,
                    created_at: now,
                };
                if (!store.conversations.some((c) => c.id === conversationId)) {
                    store.conversations.unshift({
                        id: conversationId,
                        title: content.trim().slice(0, 60) || 'New Chat',
                        channel: channel || 'web',
                        message_count: 0,
                        last_message_at: now,
                        created_at: now,
                    });
                }
                const list = store.messages[conversationId] || [];
                list.push(msg);
                store.messages[conversationId] = list;
                const conv = store.conversations.find((c) => c.id === conversationId);
                if (conv) {
                    conv.last_message_at = now;
                    conv.message_count = list.length;
                }
                await writeSettingsLibrary(store);
                return msg;
            }
        }
        catch (err) {
            logger.warn('Supabase message insert exception', { err });
        }
    }
    const msg = {
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
export async function deleteConversation(conversationId, userId) {
    const idx = memoryConversations.findIndex((c) => c.id === conversationId);
    if (idx !== -1)
        memoryConversations.splice(idx, 1);
    memoryMessages.delete(conversationId);
    const uid = await resolveUserId(userId);
    if (uid) {
        try {
            const { error } = await supabaseAdmin
                .from('conversations')
                .delete()
                .eq('id', conversationId)
                .eq('user_id', uid);
            if (!error)
                return true;
            logger.warn('Supabase conversation delete failed, cleaning user_settings backup', { error });
            const store = await readSettingsLibrary();
            const prevLen = store.conversations.length;
            store.conversations = store.conversations.filter((c) => c.id !== conversationId);
            delete store.messages[conversationId];
            if (store.conversations.length !== prevLen) {
                await writeSettingsLibrary(store);
                return true;
            }
        }
        catch (err) {
            logger.warn('Supabase conversation delete exception', { err });
        }
    }
    return idx !== -1;
}
