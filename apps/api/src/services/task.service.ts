import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface TaskItem {
  id: string;
  title: string;
  due: string;
  priority: TaskPriority;
  status: TaskStatus;
  source: string;
  created_at?: string;
}

const tasksStore: TaskItem[] = [
  {
    id: '1',
    title: 'Complete Karen Ultra Master Build Documentation',
    due: '2026-11-23',
    priority: 'urgent',
    status: 'in_progress',
    source: 'manual',
  },
  {
    id: '2',
    title: 'Review AWS Cloud Billing Statement ($14.20)',
    due: '2026-11-25',
    priority: 'medium',
    status: 'todo',
    source: 'email_derived',
  },
  {
    id: '3',
    title: 'Submit Semester Project Presentation Slides',
    due: '2026-11-27',
    priority: 'high',
    status: 'todo',
    source: 'document_derived',
  },
];

export async function listTasks(userId?: string): Promise<TaskItem[]> {
  if (userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .select('id, title, due_at, priority, status, source, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((row: any) => ({
          id: row.id,
          title: row.title,
          due: row.due_at ? String(row.due_at).slice(0, 10) : '',
          priority: row.priority || 'medium',
          status: row.status || 'todo',
          source: row.source || 'manual',
          created_at: row.created_at,
        }));
      }
    } catch (err) {
      logger.debug('Supabase tasks read fallback to in-memory store', { err });
    }
  }
  return [...tasksStore];
}

export async function addTask(
  title: string,
  due?: string,
  priority: TaskPriority = 'medium',
  source = 'manual',
  userId?: string
): Promise<TaskItem> {
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const newTask: TaskItem = {
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
    } catch (err) {
      logger.debug('Supabase tasks insert fallback to in-memory store', { err });
    }
  }

  return newTask;
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<TaskItem, 'title' | 'due' | 'priority' | 'status'>>,
  userId?: string
): Promise<TaskItem | null> {
  const task = tasksStore.find((t) => t.id === id);
  if (task) {
    Object.assign(task, patch);
  }

  if (userId) {
    try {
      const dbPatch: Record<string, unknown> = {};
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.priority !== undefined) dbPatch.priority = patch.priority;
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.due !== undefined) dbPatch.due_at = patch.due ? `${patch.due}T09:00:00+05:30` : null;
      await supabaseAdmin.from('tasks').update(dbPatch).eq('id', id).eq('user_id', userId);
    } catch (err) {
      logger.debug('Supabase tasks update fallback', { err });
    }
  }

  return task || null;
}

export async function getTasksContextPrompt(): Promise<string> {
  const active = tasksStore.filter((t) => t.status !== 'done').slice(0, 10);
  if (active.length === 0) return '';
  const lines = active.map((t) => `- [${t.priority}] ${t.title} (due: ${t.due || 'unspecified'}, status: ${t.status})`);
  return `\n\nOwner's Current Active Tasks:\n${lines.join('\n')}`;
}
