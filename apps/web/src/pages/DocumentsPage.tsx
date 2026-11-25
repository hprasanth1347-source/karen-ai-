import React, { useEffect, useRef, useState } from 'react';
import { FileText, Upload, Sparkles, Trash2, Loader2, ClipboardPaste } from 'lucide-react';
import { api } from '../lib/api';

interface DocRecord {
  id: string;
  name: string;
  size: number;
  status: string;
  source: string;
  content?: string;
  charCount?: number;
}

const STORAGE_KEY = 'karen_uploaded_docs_v1';

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function readUploadPayload(
  file: File
): Promise<{ content?: string; contentBase64?: string }> {
  const textTypes = /\.(txt|md|csv|json|log|html|xml|ts|tsx|js|py)$/i;
  if (textTypes.test(file.name) || file.type.startsWith('text/')) {
    return { content: (await file.text()).slice(0, 100000) };
  }
  if (/\.(pdf|docx)$/i.test(file.name) || file.type === 'application/pdf') {
    return { contentBase64: await fileToBase64(file) };
  }
  const buffer = await file.arrayBuffer();
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const runs = decoded.match(/[\x20-\x7E\r\n]{4,}/g) ?? [];
  return { content: runs.join(' ').replace(/\s+/g, ' ').trim() };
}

export const DocumentsPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteName, setPasteName] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [docs, setDocs] = useState<DocRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(docs.slice(0, 10)));
    } catch {
      // Ignore storage quota issues
    }
  }, [docs]);

  useEffect(() => {
    fetch('/api/v1/skills/document')
      .then((response) => response.json())
      .then((body) => setSkills(body.data?.skills || []))
      .catch(() => setSkills([]));

    api
      .get('/documents')
      .then((res) => {
        const serverDocs: DocRecord[] = res.data?.data ?? [];
        if (serverDocs.length > 0) {
          setDocs((prev) => {
            const byName = new Map(prev.map((d) => [d.name, d]));
            return serverDocs.map((sd) => ({
              ...sd,
              content: byName.get(sd.name)?.content,
            }));
          });
        }
      })
      .catch(() => {
        // Keep local docs if not yet authenticated
      });
  }, []);

  const uploadTextDoc = async (
    name: string,
    payload: { content?: string; contentBase64?: string },
    mimeType: string,
    size: number,
    source: 'Upload' | 'Paste'
  ) => {
    const res = await api.post('/documents', {
      name,
      ...payload,
      mimeType,
      size,
      source,
    });
    const created: DocRecord = res.data?.data ?? {
      id: `local_${Date.now()}`,
      name,
      size,
      status: 'READY',
      source,
      content: payload.content,
      charCount: payload.content?.length || 0,
    };
    setDocs((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const payload = await readUploadPayload(file);
        if (!payload.content && !payload.contentBase64) {
          setError(`Could not read "${file.name}".`);
          continue;
        }
        await uploadTextDoc(file.name, payload, file.type || 'text/plain', file.size, 'Upload');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Upload failed. Make sure you are signed in at /auth.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteName.trim() || !pasteContent.trim()) return;
    setError(null);
    setUploading(true);
    try {
      await uploadTextDoc(
        pasteName.trim(),
        { content: pasteContent.trim() },
        'text/plain',
        pasteContent.length,
        'Paste'
      );
      setPasteName('');
      setPasteContent('');
      setShowPaste(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save pasted document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    api.delete(`/documents/${id}`).catch(() => {});
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || analyzing) return;
    setError(null);
    setAnalyzing(true);
    try {
      const inlineDocs = docs
        .filter((d) => d.content)
        .slice(0, 5)
        .map((d) => ({ name: d.name, content: d.content! }));
      const res = await api.post('/documents/analyze', {
        query: query.trim(),
        inlineDocs,
      });
      setAnswer(res.data?.data?.answer || 'No answer returned.');
      setSources(res.data?.data?.sources || []);
    } catch (err: any) {
      setAnswer(null);
      setError(
        err?.response?.data?.error ||
          (err?.response?.status === 401
            ? 'Please sign in at /auth to analyze documents.'
            : 'Document analysis failed.')
      );
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.csv,.json,.log,.html,.xml,.pdf,.docx"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <FileText className="w-3.5 h-3.5" />
            <span>DOCUMENT PROCESSING & CITATION ENGINE</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Document Intelligence</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Upload or paste documents (notes, resumes, CSVs, PDFs, TXT/MD) and ask Karen AI questions backed by source citations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPaste((v) => !v)}
            className="btn-ghost text-xs flex items-center gap-2"
          >
            <ClipboardPaste className="w-4 h-4" />
            Paste Text
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="btn-coral text-xs flex items-center gap-2 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">
          {error}
        </div>
      )}

      {showPaste && (
        <form onSubmit={handlePasteSubmit} className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">PASTE DOCUMENT / PERSONAL DETAILS</h3>
          <input
            type="text"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder="Document title (e.g. My_Profile.txt or Syllabus.txt)"
            className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-medium outline-none"
          />
          <textarea
            rows={5}
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Paste document text here..."
            className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-medium outline-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowPaste(false)} className="btn-ghost text-xs">
              Cancel
            </button>
            <button type="submit" disabled={uploading} className="btn-coral text-xs">
              Save Document
            </button>
          </div>
        </form>
      )}

      {skills.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {skills.map((skill) => (
            <div key={skill.name} className="bg-white border-3 border-ink p-3 shadow-brutal-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black uppercase">{skill.name}</h3>
                <span className="text-[9px] font-mono bg-mint border border-ink px-1.5 py-0.5">ACTIVE</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted line-clamp-3">
                {skill.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Query Bar */}
      <form onSubmit={handleQuery} className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">QUERY DOCUMENT VAULT</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about your uploaded documents: e.g. 'Summarize key dates and action items'"
            className="flex-1 bg-cream-50 border-2 border-ink p-2 text-xs font-medium outline-none"
          />
          <button
            type="submit"
            disabled={analyzing}
            className="btn-teal text-xs flex items-center gap-1.5 disabled:opacity-60"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analyzing ? 'Analyzing...' : 'Analyze & Cite'}
          </button>
        </div>
        {answer && (
          <div className="mt-3 p-3 border-2 border-ink bg-cream-100 text-xs leading-relaxed space-y-1.5">
            <span className="font-bold text-coral block text-[11px] font-mono">
              VERIFIED AI ANSWER{sources.length > 0 ? ` • SOURCES: ${sources.join(', ')}` : ''}:
            </span>
            <p className="whitespace-pre-wrap">{answer}</p>
          </div>
        )}
      </form>

      {/* Documents List */}
      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">
          PROCESSED DOCUMENTS ({docs.length})
        </h3>
        {docs.length === 0 ? (
          <p className="text-xs text-ink-muted py-2">
            No documents uploaded yet. Click <strong>Upload Document</strong> or <strong>Paste Text</strong> above to analyze your files.
          </p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border-2 border-ink bg-cream-50 text-xs">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-ink" />
                  <div>
                    <h4 className="font-bold">{doc.name}</h4>
                    <span className="text-[10px] font-mono text-ink-muted">
                      {Math.max(1, Math.round((doc.size || doc.charCount || 0) / 1024))} KB • Source: {doc.source}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 border border-ink text-[10px] font-mono font-bold bg-mint text-ink">
                    {doc.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc.id)}
                    className="p-1 hover:text-coral transition-colors"
                    title="Remove document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default DocumentsPage;
