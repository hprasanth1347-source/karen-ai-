import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, ShieldAlert, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  channel: string;
  priority: string;
  is_read: boolean;
  created_at: string;
}

interface ApprovalItem {
  id: string;
  action_type: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export const NotificationsPage: React.FC = () => {
  const [filter, setFilter] = useState('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notifRes, appRes] = await Promise.all([
        api.get('/notifications'),
        api.get('/approvals').catch(() => ({ data: { data: [] } })),
      ]);
      setNotifications(notifRes.data?.data ?? []);
      setApprovals(appRes.data?.data ?? []);
    } catch (err: any) {
      setError(
        err?.response?.status === 401
          ? 'Sign in at /auth to load live notifications and approvals.'
          : err?.response?.data?.error || 'Failed to load notifications.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleMarkAllRead = async () => {
    await api.post('/notifications/mark-all-read').catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleApprovalDecision = async (id: string, action: 'approve' | 'reject') => {
    setError(null);
    try {
      await api.post(`/approvals/${id}/${action}`);
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: action === 'approve' ? 'approved' : 'rejected' } : a
        )
      );
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.error || `Failed to ${action} request.`);
    }
  };

  const handleRunMorningBriefing = async () => {
    setBriefingLoading(true);
    setError(null);
    try {
      await api.post('/cron/morning-briefing');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to run morning briefing.');
    } finally {
      setBriefingLoading(false);
    }
  };

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Bell className="w-3.5 h-3.5" />
            <span>UNIFIED NOTIFICATION &amp; APPROVAL CENTRE</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Notifications &amp; Sensitive Approvals</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Morning briefings, Telegram activity, and 1-click approvals for sending sensitive files.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={briefingLoading}
            onClick={handleRunMorningBriefing}
            className="btn-coral text-xs flex items-center gap-1.5 disabled:opacity-60"
          >
            {briefingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Run Morning Briefing
          </button>
          <button type="button" onClick={handleMarkAllRead} className="btn-ghost text-xs flex items-center gap-1.5">
            <CheckCheck className="w-4 h-4" />
            Mark All Read
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">
          {error}
        </div>
      )}

      {pendingApprovals.length > 0 && (
        <div className="bg-yellow/20 border-3 border-ink p-4 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm flex items-center gap-2 text-coral">
            <ShieldAlert className="w-4 h-4" />
            PENDING SENSITIVE APPROVALS ({pendingApprovals.length})
          </h3>
          <div className="space-y-2">
            {pendingApprovals.map((a) => (
              <div key={a.id} className="p-3 border-2 border-ink bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-mono font-bold uppercase text-[10px] px-1.5 py-0.5 bg-yellow border border-ink mr-2">
                    {a.action_type}
                  </span>
                  <span className="font-bold">{a.summary}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleApprovalDecision(a.id, 'approve')}
                    className="btn-teal text-[11px] py-1 px-3 flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve &amp; Send
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprovalDecision(a.id, 'reject')}
                    className="btn-ghost text-[11px] py-1 px-3 flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <div className="flex gap-2 border-b-2 border-ink pb-3 overflow-x-auto text-xs font-mono font-bold">
          {['all', 'web', 'telegram', 'gmail', 'instagram'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 border-2 border-ink capitalize ${
                filter === f ? 'bg-coral text-white' : 'bg-cream-50 hover:bg-cream-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-xs font-mono flex items-center gap-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading notifications...
          </div>
        ) : (
          <div className="space-y-2">
            {notifications
              .filter((n) => filter === 'all' || n.channel === filter)
              .map((n) => (
                <div key={n.id} className="p-3 border-2 border-ink bg-cream-50 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{n.title}</span>
                      <span className={`text-[9px] font-mono uppercase px-1 border border-ink ${
                        n.priority === 'high' ? 'bg-coral text-white' : 'bg-cream-200'
                      }`}>
                        {n.priority}
                      </span>
                    </div>
                    <p className="text-xs text-ink/80 mt-1 whitespace-pre-wrap">{n.body}</p>
                  </div>
                  <span className="text-[10px] font-mono text-ink-muted whitespace-nowrap">
                    {n.created_at?.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default NotificationsPage;
