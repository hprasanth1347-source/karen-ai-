import React, { useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  ExternalLink,
  Search,
  Save,
  Download,
  Lock,
  Loader2,
} from 'lucide-react';
import { api, readCachedGet } from '../lib/api';

interface SheetSummary {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface SheetMeta {
  title?: string;
  spreadsheetUrl?: string;
  tabs: string[];
}

export const SheetsPage: React.FC = () => {
  const cachedList = readCachedGet<{ data?: SheetSummary[] }>('/sheets')?.data;
  const [sheets, setSheets] = useState<SheetSummary[]>(() => cachedList ?? []);
  const [loadingList, setLoadingList] = useState(() => !(cachedList && cachedList.length > 0));
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Create new sheet state
  const [createTitle, setCreateTitle] = useState('');
  const [createCols, setCreateCols] = useState('Item, Category, Amount, Date');
  const [creating, setCreating] = useState(false);

  // Active sheet viewer & editor state
  const [activeId, setActiveId] = useState<string>(() => cachedList?.[0]?.id || '');
  const [meta, setMeta] = useState<SheetMeta | null>(null);
  const [activeTab, setActiveTab] = useState('Sheet1');
  const [rows, setRows] = useState<string[][]>(() => {
    const firstId = cachedList?.[0]?.id;
    if (!firstId) return [];
    const hit = readCachedGet<{ data?: unknown[][] }>(`/sheets/${encodeURIComponent(firstId)}`)?.data;
    return Array.isArray(hit) ? hit.map((r) => r.map((c) => String(c ?? ''))) : [];
  });
  const [loadingSheet, setLoadingSheet] = useState(false);

  // Quick edit cell & append row
  const [editRange, setEditRange] = useState('A1');
  const [editValue, setEditValue] = useState('');
  const [newRowText, setNewRowText] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSheets = async (force = false) => {
    if (!sheets.length || force) setLoadingList(true);
    setError(null);
    try {
      const res = await api.get<{ data: SheetSummary[] }>(
        '/sheets',
        force ? ({ skipCache: true } as any) : undefined
      );
      const list = res.data?.data ?? [];
      setSheets(list);
      setNeedsReconnect(false);
      if (!activeId && list[0]?.id) {
        setActiveId(list[0].id);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Could not load Google Sheets.';
      setError(msg);
      if (err?.response?.status === 400 || err?.response?.status === 403) {
        setNeedsReconnect(true);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const loadActiveSheet = async (sheetId: string, tabName?: string, force = false) => {
    if (!sheetId) return;
    setLoadingSheet(true);
    setError(null);
    try {
      const metaRes = await api.get<{ data: SheetMeta }>(
        `/sheets/${encodeURIComponent(sheetId)}/meta`,
        force ? ({ skipCache: true } as any) : undefined
      );
      const m = metaRes.data?.data;
      if (m) {
        setMeta(m);
        const chosenTab = tabName && m.tabs.includes(tabName) ? tabName : m.tabs[0] || 'Sheet1';
        setActiveTab(chosenTab);
        const range = `${chosenTab}!A1:Z50`;
        const valRes = await api.get<{ data: unknown[][] }>(
          `/sheets/${encodeURIComponent(sheetId)}`,
          { params: { range }, ...(force ? { skipCache: true } : {}) } as any
        );
        const raw = valRes.data?.data ?? [];
        setRows(raw.map((r) => r.map((c) => String(c ?? ''))));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not read spreadsheet data.');
    } finally {
      setLoadingSheet(false);
    }
  };

  useEffect(() => {
    void loadSheets();
  }, []);

  useEffect(() => {
    if (activeId) {
      void loadActiveSheet(activeId);
    }
  }, [activeId]);

  const handleConnect = async () => {
    const res = await api.get<{ data: { url: string } }>('/drive/auth-url', { params: { source: 'sheets' } }).catch(() => null);
    if (res?.data?.data?.url) window.location.href = res.data.data.url;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim() || creating) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const headers = createCols
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const res = await api.post<{ data: { spreadsheetId: string; spreadsheetUrl: string; title: string } }>(
        '/sheets/create',
        {
          title: createTitle.trim(),
          headers: headers.length ? headers : undefined,
        }
      );
      const created = res.data?.data;
      setCreateTitle('');
      if (created?.spreadsheetId) {
        setNotice(`Created "${created.title}".`);
        setActiveId(created.spreadsheetId);
        await loadSheets(true);
        await loadActiveSheet(created.spreadsheetId, undefined, true);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create Google Sheet.');
    } finally {
      setCreating(false);
    }
  };

  const handleAppendRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !newRowText.trim() || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const cells = newRowText.split(',').map((c) => c.trim());
      await api.post(`/sheets/${encodeURIComponent(activeId)}/append`, {
        range: `${activeTab}!A1`,
        rows: [cells],
      });
      setNewRowText('');
      setNotice('Row appended to live Google Sheet.');
      await loadActiveSheet(activeId, activeTab, true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to append row.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !editRange.trim() || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const fullRange = editRange.includes('!') ? editRange.trim() : `${activeTab}!${editRange.trim()}`;
      const rowValues = editValue.split(',').map((v) => v.trim());
      await api.put(`/sheets/${encodeURIComponent(activeId)}/update`, {
        range: fullRange,
        values: [rowValues],
      });
      setNotice(`Updated ${fullRange} in live Google Sheet.`);
      await loadActiveSheet(activeId, activeTab, true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update range.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    if (!rows.length) return;
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta?.title || 'karen-sheet'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSheets = useMemo(
    () => sheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())),
    [sheets, search]
  );

  const maxCols = useMemo(() => Math.max(4, ...rows.map((r) => r.length)), [rows]);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-teal text-[#0A0A0A] text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>LIVE GOOGLE SHEETS WORKSPACE</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Google Sheets</h1>
          <p className="text-xs text-ink-muted mt-1">
            Browse, create, inspect tabs, edit cells, append rows, and let Karen Chat / Telegram access your sheets live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void loadSheets(true);
              if (activeId) void loadActiveSheet(activeId, activeTab, true);
            }}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingList || loadingSheet ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {meta?.spreadsheetUrl && (
            <a
              href={meta.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-coral text-xs flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Google
            </a>
          )}
        </div>
      </div>

      {needsReconnect && (
        <div className="bg-yellow/50 border-3 border-ink p-4 shadow-brutal-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Lock className="w-4 h-4" />
            <span>Connect or reconnect Google once to grant Google Sheets read &amp; edit access.</span>
          </div>
          <button type="button" onClick={() => void handleConnect()} className="btn-coral text-xs">
            Connect Google Account
          </button>
        </div>
      )}

      {error && !needsReconnect && (
        <div className="p-3 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">{error}</div>
      )}
      {notice && (
        <div className="p-3 border-2 border-ink bg-teal/20 text-ink text-xs font-bold">{notice}</div>
      )}

      {/* Create New Sheet */}
      <form onSubmit={handleCreate} className="bg-white border-3 border-ink p-4 shadow-brutal grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          type="text"
          value={createTitle}
          onChange={(e) => setCreateTitle(e.target.value)}
          placeholder="New Google Sheet title (e.g. Monthly Expenses)"
          className="border-2 border-ink px-3 py-2 text-xs bg-cream-50"
          required
        />
        <input
          type="text"
          value={createCols}
          onChange={(e) => setCreateCols(e.target.value)}
          placeholder="Comma-separated headers (e.g. Item, Amount, Date)"
          className="border-2 border-ink px-3 py-2 text-xs bg-cream-50"
        />
        <button type="submit" disabled={creating} className="btn-coral text-xs flex items-center justify-center gap-1.5">
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Create Google Sheet
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Spreadsheets List */}
        <div className="lg:col-span-4 bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
          <div className="flex items-center gap-2 border-2 border-ink bg-cream-50 px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-ink-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter spreadsheets..."
              className="w-full bg-transparent text-xs outline-none"
            />
          </div>

          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {loadingList && sheets.length === 0 ? (
              <p className="text-xs font-mono text-ink-muted py-4 text-center">Loading your Google Sheets...</p>
            ) : filteredSheets.length === 0 ? (
              <p className="text-xs font-mono text-ink-muted py-4 text-center">No spreadsheets found.</p>
            ) : (
              filteredSheets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={`w-full text-left p-2.5 border-2 border-ink transition-colors ${
                    activeId === s.id ? 'bg-yellow shadow-brutal-sm' : 'bg-cream-50 hover:bg-cream-100'
                  }`}
                >
                  <div className="font-bold text-xs truncate">{s.name}</div>
                  <div className="text-[10px] font-mono text-ink-muted mt-0.5 truncate">
                    {s.modifiedTime ? new Date(s.modifiedTime).toLocaleDateString() : s.id}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Interactive Grid & Editors */}
        <div className="lg:col-span-8 bg-white border-3 border-ink p-4 shadow-brutal space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink pb-2">
            <div>
              <h2 className="font-black text-sm">{meta?.title || 'Select a Spreadsheet'}</h2>
              <p className="text-[10px] font-mono text-ink-muted">{activeId || 'No sheet selected'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(meta?.tabs || []).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => void loadActiveSheet(activeId, tab, true)}
                  className={`px-2 py-1 border-2 border-ink text-[11px] font-mono font-bold ${
                    activeTab === tab ? 'bg-teal text-white' : 'bg-cream-50'
                  }`}
                >
                  {tab}
                </button>
              ))}
              {rows.length > 0 && (
                <button type="button" onClick={handleExportCsv} className="btn-ghost text-[11px] px-2 py-1 flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  CSV
                </button>
              )}
            </div>
          </div>

          {/* Grid Table */}
          <div className="border-2 border-ink overflow-x-auto max-h-72 bg-cream-50">
            {loadingSheet ? (
              <div className="p-6 text-center text-xs font-mono text-ink-muted">Loading sheet rows...</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-ink-muted">
                No rows in {activeTab} yet. Append a row below to start.
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="bg-yellow/60 border-b-2 border-ink">
                  <tr>
                    <th className="border-r border-ink/30 px-2 py-1 text-[10px] font-mono text-ink-muted w-8">#</th>
                    {Array.from({ length: maxCols }).map((_, cIdx) => (
                      <th key={cIdx} className="border-r border-ink/30 px-2 py-1 text-left font-mono text-[11px]">
                        {String.fromCharCode(65 + cIdx)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx === 0 ? 'bg-white font-bold border-b border-ink/40' : 'border-b border-ink/15'}>
                      <td className="border-r border-ink/20 px-2 py-1 font-mono text-[10px] text-ink-muted">{rIdx + 1}</td>
                      {Array.from({ length: maxCols }).map((_, cIdx) => (
                        <td
                          key={cIdx}
                          onClick={() => {
                            const colLetter = String.fromCharCode(65 + cIdx);
                            setEditRange(`${colLetter}${rIdx + 1}`);
                            setEditValue(row[cIdx] ?? '');
                          }}
                          title="Click to edit cell"
                          className="border-r border-ink/15 px-2 py-1.5 cursor-pointer hover:bg-yellow/30 max-w-48 truncate"
                        >
                          {row[cIdx] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Editors */}
          {activeId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <form onSubmit={handleAppendRow} className="border-2 border-ink p-3 bg-cream-50 space-y-2">
                <div className="text-[11px] font-mono font-bold uppercase">Append New Row ({activeTab})</div>
                <input
                  type="text"
                  value={newRowText}
                  onChange={(e) => setNewRowText(e.target.value)}
                  placeholder="Comma-separated values (e.g. Lunch, Food, 250)"
                  className="w-full border-2 border-ink bg-white px-2.5 py-1.5 text-xs"
                />
                <button type="submit" disabled={saving} className="btn-teal text-xs w-full flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  Append Row
                </button>
              </form>

              <form onSubmit={handleUpdateCell} className="border-2 border-ink p-3 bg-cream-50 space-y-2">
                <div className="text-[11px] font-mono font-bold uppercase">Edit Cell / Range (click table cell)</div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={editRange}
                    onChange={(e) => setEditRange(e.target.value)}
                    placeholder="B2"
                    className="w-20 border-2 border-ink bg-white px-2 py-1.5 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="New value (or comma values)"
                    className="flex-1 border-2 border-ink bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <button type="submit" disabled={saving} className="btn-coral text-xs w-full flex items-center justify-center gap-1">
                  <Save className="w-3.5 h-3.5" />
                  Save Cell Update
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SheetsPage;
