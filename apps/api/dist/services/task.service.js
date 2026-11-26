import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { listGoogleTasks, updateGoogleTask } from './googleWorkspace.service.js';
const tasksStore = [];
export async function listTasks(userId) {
    const items = [];
    const seenTitles = new Set();
    // 1. Live Google Tasks (primary real task source)
    const googleRes = await listGoogleTasks(userId).catch(() => ({ ok: false, tasks: [] }));
    if (googleRes.ok && googleRes.tasks.length > 0) {
        for (const gt of googleRes.tasks) {
            const normalized = gt.title.trim().toLowerCase();
            seenTitles.add(normalized);
            items.push({
                id: `gtask:${gt.id}`,
                title: gt.title,
                due: gt.due ? String(gt.due).slice(0, 10) : '',
                priority: 'medium',
                status: gt.status === 'completed' ? 'done' : 'todo',
                source: 'google_tasks',
            });
        }
    }
    // 2. Real Supabase tasks created via Karen AI / Telegram (never fake static seeds)
    if (userId) {
        try {
            const { data, error } = await supabaseAdmin
                .from('tasks')
                .select('id, title, due_at, priority, status, source, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            if (!error && data && data.length > 0) {
                for (const row of data) {
                    const normalized = String(row.title || '').trim().toLowerCase();
                    if (seenTitles.has(normalized))
                        continue;
                    seenTitles.add(normalized);
                    items.push({
                        id: row.id,
                        title: row.title,
                        due: row.due_at ? String(row.due_at).slice(0, 10) : '',
                        priority: row.priority || 'medium',
                        status: row.status || 'todo',
                        source: row.source || 'manual',
                        created_at: row.created_at,
                    });
                }
            }
        }
        catch (err) {
            logger.debug('Supabase tasks read fallback to in-memory store', { err });
        }
    }
    for (const local of tasksStore) {
        const normalized = local.title.trim().toLowerCase();
        if (!seenTitles.has(normalized)) {
            seenTitles.add(normalized);
            items.push(local);
        }
    }
    return items;
}
export async function addTask(title, due, priority = 'medium', source = 'manual', userId) {
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const newTask = {
        id: Date.now().toString(),
        title: title.trim(),
        due: due?.trim() || todayIso,
        priority,
        status: 'todo',
        source,
        created_at: new Date().toISOString(),
    };
    tasksStore.unshift(newTask);
    if (userId) {
        try {
            const { data, error } = await supabaseAdmin
                .from('tasks')
                .insert({
                user_id: userId,
                title: newTask.title,
                due_at: newTask.due ? `${newTask.due}T09:00:00+05:30` : null,
                priority: newTask.priority,
                status: newTask.status,
                source: newTask.source,
            })
                .select('id, title, due_at, priority, status, source, created_at')
                .single();
            if (!error && data) {
                return {
                    id: data.id,
                    title: data.title,
                    due: data.due_at ? String(data.due_at).slice(0, 10) : newTask.due,
                    priority: data.priority || newTask.priority,
                    status: data.status || newTask.status,
                    source: data.source || newTask.source,
                    created_at: data.created_at,
                };
            }
        }
        catch (err) {
            logger.debug('Supabase tasks insert fallback to in-memory store', { err });
        }
    }
    return newTask;
}
export async function updateTask(id, patch, userId) {
    if (id.startsWith('gtask:')) {
        const gTaskId = id.slice(6);
        const gRes = await updateGoogleTask({
            taskId: gTaskId,
            status: patch.status === 'done' ? 'completed' : patch.status ? 'needsAction' : undefined,
            title: patch.title,
            dueIso: patch.due,
            userId,
        });
        if (gRes.ok && gRes.task) {
            return {
                id,
                title: gRes.task.title,
                due: gRes.task.due ? String(gRes.task.due).slice(0, 10) : patch.due || '',
                priority: patch.priority || 'medium',
                status: gRes.task.status === 'completed' ? 'done' : 'todo',
                source: 'google_tasks',
            };
        }
        return null;
    }
    const task = tasksStore.find((t) => t.id === id);
    if (task) {
        Object.assign(task, patch);
    }
    if (userId) {
        try {
            const dbPatch = {};
            if (patch.title !== undefined)
                dbPatch.title = patch.title;
            if (patch.priority !== undefined)
                dbPatch.priority = patch.priority;
            if (patch.status !== undefined)
                dbPatch.status = patch.status;
            if (patch.due !== undefined)
                dbPatch.due_at = patch.due ? `${patch.due}T09:00:00+05:30` : null;
            await supabaseAdmin.from('tasks').update(dbPatch).eq('id', id).eq('user_id', userId);
        }
        catch (err) {
            logger.debug('Supabase tasks update fallback', { err });
        }
    }
    return task || null;
}
export async function getTasksContextPrompt() {
    const all = await listTasks().catch(() => []);
    const active = all.filter((t) => t.status !== 'done').slice(0, 12);
    if (active.length === 0)
        return '';
    const lines = active.map((t) => `- [${t.priority}] ${t.title} (due: ${t.due || 'unspecified'}, status: ${t.status}, source: ${t.source})`);
    return `\n\nOwner's Live Active Tasks:\n${lines.join('\n')}`;
}
