import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { cacheService } from '../services/cache.service.js';
const pendingStore = new Map();
const chatResultsStore = new Map();
const chatUploadStore = new Map();
const macrosStore = new Map();
const telegramDedupeSet = new Set();
export async function markTelegramUpdateProcessed(updateId) {
    if (telegramDedupeSet.has(updateId))
        return false;
    telegramDedupeSet.add(updateId);
    if (telegramDedupeSet.size > 2000) {
        const first = telegramDedupeSet.values().next().value;
        if (first !== undefined)
            telegramDedupeSet.delete(first);
    }
    // Persistent Redis deduplication across Vercel serverless cold starts
    const redisKey = `tg:update_dedupe:${updateId}`;
    try {
        const existing = await cacheService.get(redisKey);
        if (existing)
            return false;
        await cacheService.set(redisKey, true, 86400);
    }
    catch {
        // Continue to DB dedupe fallback
    }
    if (supabaseAdmin) {
        try {
            const { error } = await supabaseAdmin
                .from('telegram_updates_dedupe')
                .insert({ update_id: updateId });
            if (error && error.code === '23505')
                return false;
            if (!error)
                return true;
        }
        catch {
            // Fall through to user_settings dedupe
        }
        try {
            const { loadUserSetting, saveUserSetting } = await import('../services/persistence.service.js');
            const recent = (await loadUserSetting('telegram_recent_updates')) || [];
            if (recent.includes(updateId))
                return false;
            const next = [...recent.slice(-199), updateId];
            await saveUserSetting('telegram_recent_updates', next);
        }
        catch {
            // Non-fatal
        }
    }
    return true;
}
export async function savePendingAction(input) {
    const ttlMs = (input.ttlMinutes ?? 10) * 60 * 1000;
    const record = {
        id: randomUUID(),
        chatKey: input.chatKey,
        userId: input.userId,
        actionType: input.actionType,
        payload: input.payload,
        promptQuestion: input.promptQuestion,
        status: 'pending',
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    pendingStore.set(record.id, record);
    if (supabaseAdmin) {
        try {
            await supabaseAdmin.from('pending_actions').insert({
                id: record.id,
                chat_key: record.chatKey,
                user_id: record.userId || null,
                action_type: record.actionType,
                payload: record.payload,
                prompt_question: record.promptQuestion || null,
                status: 'pending',
                expires_at: record.expiresAt,
            });
        }
        catch {
            // Fallback in memory
        }
    }
    return record;
}
export async function getActivePendingAction(chatKey) {
    const now = Date.now();
    const inMem = Array.from(pendingStore.values())
        .filter((p) => p.chatKey === chatKey && p.status === 'pending')
        .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];
    if (inMem) {
        if (new Date(inMem.expiresAt).getTime() <= now) {
            inMem.status = 'expired';
            return null;
        }
        return inMem;
    }
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('pending_actions')
                .select('*')
                .eq('chat_key', chatKey)
                .eq('status', 'pending')
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (data) {
                return {
                    id: data.id,
                    chatKey: data.chat_key,
                    userId: data.user_id || undefined,
                    actionType: data.action_type,
                    payload: (data.payload || {}),
                    promptQuestion: data.prompt_question || undefined,
                    status: data.status,
                    expiresAt: data.expires_at,
                };
            }
        }
        catch {
            // Ignore
        }
    }
    return null;
}
/**
 * Atomically claim a pending action by ID (prevents double-tap sends).
 */
export async function claimPendingActionById(actionId, newStatus) {
    const mem = pendingStore.get(actionId);
    if (mem) {
        if (mem.status !== 'pending') {
            return { claimed: false, reason: 'already_processed' };
        }
        if (new Date(mem.expiresAt).getTime() <= Date.now()) {
            mem.status = 'expired';
            return { claimed: false, reason: 'expired' };
        }
        mem.status = newStatus;
        if (supabaseAdmin) {
            await supabaseAdmin
                .from('pending_actions')
                .update({ status: newStatus })
                .eq('id', actionId)
                .eq('status', 'pending')
                .then(() => { }, () => { });
        }
        return { claimed: true, action: mem };
    }
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('pending_actions')
                .update({ status: newStatus })
                .eq('id', actionId)
                .eq('status', 'pending')
                .gt('expires_at', new Date().toISOString())
                .select()
                .maybeSingle();
            if (data) {
                return {
                    claimed: true,
                    action: {
                        id: data.id,
                        chatKey: data.chat_key,
                        userId: data.user_id || undefined,
                        actionType: data.action_type,
                        payload: (data.payload || {}),
                        promptQuestion: data.prompt_question || undefined,
                        status: data.status,
                        expiresAt: data.expires_at,
                    },
                };
            }
            return { claimed: false, reason: 'expired' };
        }
        catch {
            return { claimed: false, reason: 'not_found' };
        }
    }
    return { claimed: false, reason: 'not_found' };
}
export async function cancelPendingForChat(chatKey) {
    let cancelled = false;
    for (const p of pendingStore.values()) {
        if (p.chatKey === chatKey && p.status === 'pending') {
            p.status = 'cancelled';
            cancelled = true;
        }
    }
    if (supabaseAdmin) {
        await supabaseAdmin
            .from('pending_actions')
            .update({ status: 'cancelled' })
            .eq('chat_key', chatKey)
            .eq('status', 'pending')
            .then(() => { }, () => { });
    }
    return cancelled;
}
export async function saveLastResults(chatKey, items) {
    chatResultsStore.set(chatKey, items);
    if (supabaseAdmin) {
        await supabaseAdmin
            .from('chat_command_state')
            .upsert({
            chat_key: chatKey,
            last_results: items,
            updated_at: new Date().toISOString(),
        })
            .then(() => { }, () => { });
    }
}
export async function getLastResults(chatKey) {
    const mem = chatResultsStore.get(chatKey);
    if (mem)
        return mem;
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('chat_command_state')
                .select('last_results')
                .eq('chat_key', chatKey)
                .maybeSingle();
            if (data?.last_results && Array.isArray(data.last_results)) {
                chatResultsStore.set(chatKey, data.last_results);
                return data.last_results;
            }
        }
        catch {
            // ignore
        }
    }
    return [];
}
export async function saveLastUploadedFile(chatKey, file) {
    chatUploadStore.set(chatKey, file);
    if (supabaseAdmin) {
        await supabaseAdmin
            .from('chat_command_state')
            .upsert({
            chat_key: chatKey,
            last_uploaded_file: file,
            updated_at: new Date().toISOString(),
        })
            .then(() => { }, () => { });
    }
}
export async function getLastUploadedFile(chatKey) {
    const thirtyMinsMs = 30 * 60 * 1000;
    const mem = chatUploadStore.get(chatKey);
    if (mem) {
        if (Date.now() - new Date(mem.uploadedAt).getTime() <= thirtyMinsMs)
            return mem;
        chatUploadStore.delete(chatKey);
        return null;
    }
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('chat_command_state')
                .select('last_uploaded_file')
                .eq('chat_key', chatKey)
                .maybeSingle();
            const file = data?.last_uploaded_file;
            if (file && Date.now() - new Date(file.uploadedAt).getTime() <= thirtyMinsMs) {
                chatUploadStore.set(chatKey, file);
                return file;
            }
        }
        catch {
            // ignore
        }
    }
    return null;
}
export async function saveCommandMacro(triggerPhrase, instruction, userId) {
    const key = triggerPhrase.trim().toLowerCase();
    const macro = {
        id: randomUUID(),
        triggerPhrase: key,
        steps: [{ instruction: instruction.trim() }],
        createdAt: new Date().toISOString(),
    };
    macrosStore.set(key, macro);
    if (supabaseAdmin) {
        await supabaseAdmin
            .from('command_macros')
            .upsert({
            id: macro.id,
            user_id: userId || null,
            trigger_phrase: key,
            steps: macro.steps,
        }, { onConflict: 'trigger_phrase' })
            .then(() => { }, () => { });
    }
    return macro;
}
export async function listCommandMacros() {
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('command_macros')
                .select('*')
                .order('created_at', { ascending: false });
            if (data && data.length > 0) {
                return data.map((d) => ({
                    id: d.id,
                    triggerPhrase: d.trigger_phrase,
                    steps: (d.steps || []),
                    createdAt: d.created_at,
                }));
            }
        }
        catch {
            // Fallback
        }
    }
    return Array.from(macrosStore.values());
}
export async function deleteCommandMacro(triggerOrId) {
    const key = triggerOrId.trim().toLowerCase();
    let deleted = macrosStore.delete(key);
    for (const [k, m] of macrosStore.entries()) {
        if (m.id === triggerOrId) {
            macrosStore.delete(k);
            deleted = true;
        }
    }
    if (supabaseAdmin) {
        await supabaseAdmin
            .from('command_macros')
            .delete()
            .or(`trigger_phrase.eq.${key},id.eq.${triggerOrId}`)
            .then(() => { }, () => { });
    }
    return deleted;
}
export async function findMatchingMacro(text) {
    const clean = text.trim().toLowerCase();
    const macros = await listCommandMacros();
    return macros.find((m) => clean === m.triggerPhrase || clean.startsWith(`${m.triggerPhrase} `)) || null;
}
