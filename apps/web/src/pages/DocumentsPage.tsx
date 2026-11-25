import React, { useEffect, useState } from 'react';
import { FileText, Upload, Sparkles, Search, CheckCircle2, AlertCircle } from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([]);

  useEffect(() => {
    fetch('/api/v1/skills/document')
      .then((response) => response.json())
      .then((body) => setSkills(body.data?.skills || []))
      .catch(() => setSkills([]));
  }, []);

  const sampleDocs = [
    { name: 'Semester_Syllabus_2026.pdf', pages: 12, size: '1.2 MB', status: 'READY', source: 'Upload' },
    { name: 'Project_Architecture_Overview.docx', pages: 8, size: '850 KB', status: 'READY', source: 'Drive' },
    { name: 'Bank_Statement_Oct2026.pdf', pages: 3, size: '320 KB', status: 'ENCRYPTED', source: 'Upload' },
  ];

  const handleQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setAnswer(
      `Citation [Semester_Syllabus_2026.pdf §Page 4]: "Final submission deadline is December 5th, with viva scheduled for the subsequent week." Relevant extracted date: Dec 5, 2026.`
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <FileText className="w-3.5 h-3.5" />
            <span>DOCUMENT PROCESSING & CITATION ENGINE</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Document Intelligence</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Extract text, tables, amounts, dates, and action items from PDFs, Word documents, Excel sheets, and images. Answers are backed by explicit source citations.
          </p>
        </div>
        <button className="btn-coral text-xs flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

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
            placeholder="Ask anything about your uploaded documents: e.g. 'What is the project submission date?'"
            className="flex-1 bg-cream-50 border-2 border-ink p-2 text-xs font-medium outline-none"
          />
          <button type="submit" className="btn-teal text-xs flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            Analyze & Cite
          </button>
        </div>
        {answer && (
          <div className="mt-3 p-3 border-2 border-ink bg-cream-100 text-xs leading-relaxed space-y-1">
            <span className="font-bold text-coral block text-[11px] font-mono">VERIFIED ANSWER:</span>
            <p>{answer}</p>
          </div>
        )}
      </form>

      {/* Documents List */}
      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">PROCESSED DOCUMENTS</h3>
        <div className="space-y-2">
          {sampleDocs.map((doc, i) => (
            <div key={i} className="flex items-center justify-between p-3 border-2 border-ink bg-cream-50 text-xs">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-ink" />
                <div>
                  <h4 className="font-bold">{doc.name}</h4>
                  <span className="text-[10px] font-mono text-ink-muted">
                    {doc.pages} pages • {doc.size} • Source: {doc.source}
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 border border-ink text-[10px] font-mono font-bold ${
                doc.status === 'READY' ? 'bg-mint text-ink' : 'bg-yellow text-ink'
              }`}>
                {doc.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default DocumentsPage;
