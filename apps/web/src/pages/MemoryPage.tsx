import React, { useState } from 'react';
import { Brain, Plus, Search, Tag, Trash2, CheckCircle2 } from 'lucide-react';

export const MemoryPage: React.FC = () => {
  const [memories, setMemories] = useState([
    {
      id: '1',
      content: 'Owner prefers conversational responses in Thanglish by default.',
      category: 'preference',
      importance: 5,
      source: 'user_confirmed',
      created_at: '2026-11-23',
    },
    {
      id: '2',
      content: 'Primary timezone is Asia/Kolkata (+05:30). Reminders must use IST.',
      category: 'instruction',
      importance: 5,
      source: 'user_confirmed',
      created_at: '2026-11-23',
    },
    {
      id: '3',
      content: 'Strict female-only voice policy: ElevenLabs female voice confirmed.',
      category: 'instruction',
      importance: 5,
      source: 'user_confirmed',
      created_at: '2026-11-23',
    },
  ]);

  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('fact');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setMemories((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        content: newContent,
        category: newCategory,
        importance: 4,
        source: 'user_confirmed',
        created_at: new Date().toISOString().split('T')[0],
      },
    ]);
    setNewContent('');
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
            Controlled personal facts, instructions and preferences. Karen uses these to personalize answers and understand context. No silent conversational recording.
          </p>
        </div>
      </div>

      {/* Add Memory Form */}
      <form onSubmit={handleAdd} className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">ADD VERIFIED MEMORY</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add a verified fact: e.g. 'Coffee preference is filter coffee with low sugar'"
            className="flex-1 bg-cream-50 border-2 border-ink p-2 text-xs font-medium outline-none"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="bg-white border-2 border-ink px-3 py-2 text-xs font-bold"
          >
            <option value="fact">Fact</option>
            <option value="preference">Preference</option>
            <option value="instruction">Instruction</option>
            <option value="work">Work</option>
            <option value="personal">Personal</option>
          </select>
          <button type="submit" className="btn-coral text-xs flex items-center justify-center gap-1.5 whitespace-nowrap">
            <Plus className="w-4 h-4" />
            Save Memory
          </button>
        </div>
      </form>

      {/* Memory List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {memories.map((m) => (
          <div key={m.id} className="bg-white border-3 border-ink p-4 shadow-brutal space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono border-b border-ink/20 pb-1">
              <span className="font-bold uppercase px-1.5 py-0.5 bg-cream-200 border border-ink">
                {m.category}
              </span>
              <span className="text-ink-muted">{m.created_at}</span>
            </div>
            <p className="text-xs font-medium leading-relaxed">{m.content}</p>
            <div className="flex items-center justify-between pt-2 text-[10px] font-mono text-ink-muted">
              <span className="flex items-center gap-1 text-mint font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> USER CONFIRMED
              </span>
              <span>Priority: ★★★★★</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default MemoryPage;
