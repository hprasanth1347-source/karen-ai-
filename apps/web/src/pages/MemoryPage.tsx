import React, { useEffect, useState } from 'react';
import { Brain, Plus, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface MemoryItem {
  id: string;
  content: string;
  category: string;
  importance?: number;
  source?: string;
  created_at: string;
}

export const MemoryPage: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('personal');

  useEffect(() => {
    let active = true;
    api
      .get('/memories')
      .then((res) => {
        if (active) setMemories(res.data?.data ?? []);
      })
      .catch((err) => {
        if (active) {
          setError(
            err?.response?.status === 401
              ? 'Sign in at /auth to load and save your personal details to Karen AI.'
              : err?.response?.data?.error || 'Could not load memories.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await api.post('/memories', {
        content: newContent.trim(),
        category: newCategory,
      });
      if (res.data?.data) {
        setMemories((prev) => [res.data.data, ...prev]);
      }
      setNewContent('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save memory. Please sign in at /auth.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await api.delete(`/memories/${id}`);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete memory.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-electric text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Brain className="w-3.5 h-3.5" />
            <span>KAREN LONG-TERM MEMORY ENGINE</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Personal Memory Vault</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Feed Karen your personal details, business info, instructions, and preferences. Karen injects these directly into AI Chat and Instagram auto-replies.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">
          {error}
        </div>
      )}

      {/* Add Memory Form */}
      <form onSubmit={handleAdd} className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">FEED DETAILS TO KAREN AI</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="e.g. 'My name is Hari, founder of HL Clothing in Chennai. Working hours 10am-8pm.'"
            className="flex-1 bg-cream-50 border-2 border-ink p-2 text-xs font-medium outline-none"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="bg-white border-2 border-ink px-3 py-2 text-xs font-bold"
          >
            <option value="personal">Personal</option>
            <option value="work">Work / Business</option>
            <option value="preference">Preference</option>
            <option value="instruction">Instruction</option>
            <option value="fact">Fact</option>
            <option value="other">Other</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="btn-coral text-xs flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save to AI'}
          </button>
        </div>
      </form>

      {/* Memory List */}
      {loading ? (
        <div className="p-6 bg-white border-3 border-ink shadow-brutal text-xs font-mono flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading saved memories...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {memories.map((m) => (
            <div key={m.id} className="bg-white border-3 border-ink p-4 shadow-brutal space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono border-b border-ink/20 pb-1">
                <span className="font-bold uppercase px-1.5 py-0.5 bg-cream-200 border border-ink">
                  {m.category}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-ink-muted">{m.created_at?.slice(0, 10)}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    className="p-1 hover:text-coral transition-colors"
                    title="Delete memory"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs font-medium leading-relaxed">{m.content}</p>
              <div className="flex items-center justify-between pt-2 text-[10px] font-mono text-ink-muted">
                <span className="flex items-center gap-1 text-mint font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> ACTIVE IN AI CONTEXT
                </span>
                <span>Priority: {'★'.repeat(m.importance || 4)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default MemoryPage;
