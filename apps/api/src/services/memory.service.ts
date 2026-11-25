import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';

export type MemoryCategory =
  | 'personal'
  | 'work'
  | 'preference'
  | 'fact'
  | 'instruction'
  | 'reminder'
  | 'other';

export interface MemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  source: string;
  created_at: string;
}

const defaultMemories: MemoryItem[] = [
  {
    id: '1',
    content: 'Owner prefers conversational responses in Thanglish by default.',
    category: 'preference',
    importance: 5,
    source: 'user_confirmed',
    created_at: '2026-11-23T00:00:00.000Z',
  },
  {
    id: '2',
    content: 'Primary timezone is Asia/Kolkata (+05:30). Reminders must use IST.',
    category: 'instruction',
    importance: 5,
    source: 'user_confirmed',
    created_at: '2026-11-23T00:00:00.000Z',
  },
  {
    id: '3',
    content: 'Strict female-only voice policy: ElevenLabs female voice confirmed.',
    category: 'instruction',
    importance: 5,
    source: 'user_confirmed',
    created_at: '2026-11-23T00:00:00.000Z',
  },
];

const memoryStore: MemoryItem[] = [...defaultMemories];

export async function listMemories(userId?: string): Promise<MemoryItem[]> {
  if (userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('memories')
        .select('id, content, category, importance, source, created_at')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data as MemoryItem[];
      }
    } catch (err) {
      logger.debug('Supabase memories read fallback to in-memory store', { err });
    }
  }
  return [...memoryStore];
}

export async function addMemory(
  content: string,
  category: MemoryCategory = 'fact',
  userId?: string
): Promise<MemoryItem> {
  const newItem: MemoryItem = {
    id: Date.now().toString(),
    content: content.trim(),
    category,
    importance: 4,
    source: 'user_confirmed',
    created_at: new Date().toISOString(),
  };

  memoryStore.unshift(newItem);

  if (userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('memories')
        .insert({
          user_id: userId,
          content: newItem.content,
          category: newItem.category,
          importance: newItem.importance,
          source: newItem.source,
          source_type: 'user_confirmed',
        })
        .select('id, content, category, importance, source, created_at')
        .single();

      if (!error && data) {
        return data as MemoryItem;
      }
    } catch (err) {
      logger.debug('Supabase memories insert fallback to in-memory store', { err });
    }
  }

  return newItem;
}

export async function deleteMemory(id: string, userId?: string): Promise<boolean> {
  const idx = memoryStore.findIndex((m) => m.id === id);
  if (idx !== -1) {
    memoryStore.splice(idx, 1);
  }

  if (userId) {
    try {
      await supabaseAdmin.from('memories').delete().eq('id', id).eq('user_id', userId);
    } catch (err) {
      logger.debug('Supabase memories delete fallback', { err });
    }
  }

  return true;
}

export async function getMemoryContextPrompt(userId?: string): Promise<string> {
  let items: MemoryItem[] = [...memoryStore];
  try {
    const query = supabaseAdmin
      .from('memories')
      .select('id, content, category, importance, source, created_at')
      .eq('is_archived', false)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(25);

    const { data, error } = userId ? await query.eq('user_id', userId) : await query;
    if (!error && data && data.length > 0) {
      const seen = new Set(data.map((m: any) => m.content));
      items = [
        ...(data as MemoryItem[]),
        ...memoryStore.filter((m) => !seen.has(m.content)),
      ];
    }
  } catch (err) {
    logger.debug('Supabase memory context fetch fallback to in-memory store', { err });
  }

  if (items.length === 0) return '';
  const lines = items
    .slice(0, 25)
    .map((m) => `- [${m.category}] ${m.content}`);
  return `\n\nOwner's Verified Personal Details & Instructions:\n${lines.join('\n')}`;
}
