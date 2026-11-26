import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../lib/api';

interface ActivityRow {
  id: string;
  title?: string;
  body?: string;
  source?: string;
  action?: string;
  createdAt?: string;
  created_at?: string;
}

export const ActivityPage: React.FC = () => {
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/activity')
      .then((res) => setItems(res.data?.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal">
        <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-[#0A0A0A] text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
          <History className="w-3.5 h-3.5" />
          <span>AUDIT &amp; ACTIVITY FEED</span>
        </div>
        <h1 className="text-xl md:text-2xl font-black">Activity Timeline</h1>
        <p className="text-xs text-ink-muted mt-1">Live actions, tool calls, and system notifications.</p>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-2">
        {loading ? (
          <p className="text-xs font-mono text-ink-muted">Loading activity...</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-ink-muted">No activity recorded yet.</p>
        ) : (
          items.map((item, idx) => (
            <div key={item.id || idx} className="border border-ink p-3 bg-cream-50 text-xs space-y-1">
              <div className="flex justify-between font-bold">
                <span>{item.title || item.action || 'Activity'}</span>
                <span className="font-mono text-[10px] text-ink-muted">{item.source || ''}</span>
              </div>
              {item.body && <p className="text-ink-muted">{item.body}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
export default ActivityPage;
