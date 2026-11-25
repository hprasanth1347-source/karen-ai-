import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MessageSquare,
  CheckSquare,
  Brain,
  FileText,
  Phone,
  Shield,
  Activity,
  X
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          setQuery('');
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    { label: 'Start Karen AI Chat (Thanglish)', path: '/ai-chat', icon: MessageSquare, category: 'AI' },
    { label: 'Add New Task / Reminder', path: '/tasks', icon: CheckSquare, category: 'Tasks' },
    { label: 'Search Personal Memories', path: '/memory', icon: Brain, category: 'Memory' },
    { label: 'Upload or Query Documents', path: '/documents', icon: FileText, category: 'Intelligence' },
    { label: 'DOCX, PDF, PPTX & XLSX Skills', path: '/documents', icon: FileText, category: 'Document Skills' },
    { label: 'WhatsApp Communications', path: '/whatsapp', icon: Phone, category: 'Channels' },
    { label: 'System Health & Diagnostics', path: '/monitor', icon: Activity, category: 'System' },
    { label: 'Security & Access Logs', path: '/security', icon: Shield, category: 'Security' },
  ];

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-ink/60 z-50 flex items-start justify-center pt-20 px-4">
      <div className="bg-cream border-3 border-ink shadow-brutal-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        <div className="p-3 border-b-3 border-ink flex items-center gap-2 bg-white">
          <Search className="w-5 h-5 text-ink-muted" />
          <input
            type="text"
            placeholder="Search commands, modules, tools..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full text-sm font-medium bg-transparent outline-none placeholder:text-ink-muted"
          />
          <button
            onClick={onClose}
            className="p-1 border border-ink hover:bg-cream-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs font-mono text-ink-muted">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    onClose();
                  }}
                  className="w-full text-left flex items-center justify-between p-2.5 border-2 border-transparent hover:border-ink hover:bg-white hover:shadow-brutal-sm transition-all text-xs font-bold cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-coral" />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-cream-200 px-1.5 py-0.5 border border-ink">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-2 border-t-2 border-ink bg-cream-100 flex items-center justify-between text-[10px] font-mono text-ink-muted">
          <span>Navigate with mouse or Tab</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};
