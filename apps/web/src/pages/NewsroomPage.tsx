import React, { useCallback, useEffect, useState } from 'react';
import { Newspaper, RefreshCw, Send, Pause, Play, ExternalLink, FileText } from 'lucide-react';
import { api } from '../lib/api';

interface NewsArticle {
  id: string;
  section: string;
  headline: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
}

interface EditionRec {
  id: string;
  editionDate: string;
  issueNumber: number;
  language: 'ta' | 'en';
  status: string;
  articles: NewsArticle[];
  summary: string;
  createdAt: string;
}

interface NewsroomCfg {
  brandEnglish: string;
  brandTamil: string;
  tagline: string;
  mode: 'MANUAL' | 'APPROVAL' | 'AUTOMATIC';
  scheduleTimeIst: string;
  paused: boolean;
}

export const NewsroomPage: React.FC = () => {
  const [cfg, setCfg] = useState<NewsroomCfg | null>(null);
  const [editions, setEditions] = useState<EditionRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: { config: NewsroomCfg; editions: EditionRec[] } }>('/newsroom/status');
      if (res.data?.data) {
        setCfg(res.data.data.config);
        setEditions(res.data.data.editions || []);
      }
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to load KAREN TIMES Newsroom');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async () => {
    setBusy('generate');
    setNotice(null);
    setErrMsg(null);
    try {
      await api.post('/newsroom/generate', {});
      setNotice('Generated Tamil & English KAREN TIMES editions from live RSS sources!');
      await load();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async (id: string) => {
    setBusy(id);
    setNotice(null);
    setErrMsg(null);
    try {
      const res = await api.post<{ data: { deliveredToTelegram: boolean } }>(`/newsroom/publish/${id}`, {});
      setNotice(
        res.data?.data?.deliveredToTelegram
          ? 'Edition published and PDF delivered to Telegram!'
          : 'Edition published (Telegram not configured or delivery skipped).'
      );
      await load();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(null);
    }
  };

  const handleTogglePause = async () => {
    if (!cfg) return;
    setBusy('pause');
    try {
      await api.post(cfg.paused ? '/newsroom/resume' : '/newsroom/pause', {});
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleModeChange = async (mode: 'MANUAL' | 'APPROVAL' | 'AUTOMATIC') => {
    setBusy('mode');
    try {
      await api.put('/newsroom/config', { mode });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Masthead Header */}
      <div className="bg-[#F4EBDD] text-[#202020] border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-[#A78248] text-white text-[11px] font-mono font-bold border-2 border-ink mb-2">
            <Newspaper className="w-3.5 h-3.5" />
            <span>KAREN TIMES • கரென் டைம்ஸ் • 07:00 IST</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">KAREN TIMES NEWSROOM</h1>
          <p className="text-xs font-mono text-[#686868] mt-0.5">
            {cfg?.tagline || 'KNOWLEDGE IS WISDOM.'} — Tamil &amp; English Daily Newspaper + Telegram PDF Delivery
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy !== null}
            className="btn-brutal bg-coral text-white text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy === 'generate' ? 'animate-spin' : ''}`} />
            <span>{busy === 'generate' ? 'Generating…' : 'Generate Today’s Editions'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleTogglePause()}
            disabled={busy !== null || !cfg}
            className="btn-ghost text-xs flex items-center gap-1.5 bg-white"
          >
            {cfg?.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{cfg?.paused ? 'Resume 07:00 IST' : 'Emergency Stop'}</span>
          </button>
        </div>
      </div>

      {/* Mode Controls */}
      {cfg && (
        <div className="bg-white border-2 border-ink p-4 shadow-brutal-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="font-mono">
            <strong>PUBLISHING MODE:</strong>{' '}
            <span className="text-ink-muted">Schedule: {cfg.scheduleTimeIst} Asia/Kolkata • {cfg.paused ? 'PAUSED' : 'ACTIVE'}</span>
          </div>
          <div className="flex gap-1.5">
            {(['MANUAL', 'APPROVAL', 'AUTOMATIC'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void handleModeChange(m)}
                disabled={busy !== null}
                className={`px-2.5 py-1 border-2 border-ink font-mono font-bold ${cfg.mode === m ? 'bg-ink text-white' : 'bg-cream-50'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {notice && <div className="p-3 bg-mint border-2 border-ink text-xs font-bold">{notice}</div>}
      {errMsg && <div className="p-3 bg-red-100 text-red-900 border-2 border-ink text-xs font-bold">{errMsg}</div>}

      {/* Editions List */}
      {loading ? (
        <div className="p-6 bg-white border-2 border-ink text-xs font-mono">Loading KAREN TIMES editions…</div>
      ) : editions.length === 0 ? (
        <div className="p-8 bg-white border-2 border-dashed border-ink text-center text-xs font-mono text-ink-muted">
          No KAREN TIMES editions generated yet. Click <strong>Generate Today’s Editions</strong> to fetch live RSS stories and build Tamil &amp; English PDFs.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {editions.map((ed) => (
            <div key={ed.id} className="bg-[#F4EBDD] text-[#202020] border-3 border-ink p-4 shadow-brutal space-y-3">
              <div className="flex items-center justify-between border-b-2 border-[#202020] pb-2">
                <div>
                  <span className="font-black text-base">
                    {ed.language === 'ta' ? 'கரென் டைம்ஸ் (தமிழ்)' : 'KAREN TIMES (English)'}
                  </span>
                  <div className="text-[11px] font-mono text-[#686868]">
                    Issue #{ed.issueNumber} • {ed.editionDate} • {ed.articles.length} articles
                  </div>
                </div>
                <span className="px-2 py-0.5 border border-ink bg-white font-mono text-[10px] font-bold uppercase">
                  {ed.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs max-h-48 overflow-y-auto">
                {ed.articles.map((a) => (
                  <div key={a.id} className="p-2 bg-white/80 border border-ink">
                    <div className="text-[10px] font-mono font-bold text-[#A78248] uppercase">{a.section}</div>
                    <div className="font-bold">{a.headline}</div>
                    <div className="text-[10px] text-[#686868]">{a.sourceName}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={`/api/v1/newsroom/editions/${ed.id}/html`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost text-xs bg-white flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> HTML Preview
                </a>
                <a
                  href={`/api/v1/newsroom/editions/${ed.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost text-xs bg-white flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" /> PDF Edition
                </a>
                <button
                  type="button"
                  onClick={() => void handlePublish(ed.id)}
                  disabled={busy !== null}
                  className="btn-brutal bg-teal text-white text-xs flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{busy === ed.id ? 'Sending…' : 'Publish to Telegram'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NewsroomPage;
