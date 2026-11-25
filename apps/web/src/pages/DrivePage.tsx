import React from 'react';
import { HardDrive, Search, ShieldCheck, Lock, FileText, CheckCircle2 } from 'lucide-react';

export const DrivePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-teal text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <HardDrive className="w-3.5 h-3.5" />
            <span>GOOGLE DRIVE REPOSITORY & INDEXER</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Google Drive Personal Document Vault</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Search personal files, project documents, notes and invoices stored in Google Drive. Sensitive files (Aadhaar, Bank details) are masked by default and require owner verification.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs">Selective Folder Sync</button>
          <button className="btn-teal text-xs">Re-Index Documents</button>
        </div>
      </div>

      <div className="bg-cream-100 border-3 border-ink p-4 shadow-brutal flex items-center gap-2">
        <Search className="w-4 h-4 text-ink" />
        <input
          type="text"
          placeholder="Kelunga: 'Find my invoice', 'Search college notes', 'Identity doc'..."
          className="bg-transparent text-xs font-medium w-full outline-none"
        />
        <button className="btn-brutal bg-white text-xs py-1 px-3">Search</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal" />
            INDEXED DOCUMENTS
          </h3>
          <div className="space-y-2 text-xs">
            {[
              { name: 'KAREN_ULTRA_MASTER_BUILD.md', size: '24 KB', date: 'Today' },
              { name: 'College_Final_Project_Report.pdf', size: '2.4 MB', date: '21 Nov' },
              { name: 'Electricity_Bill_Oct2026.pdf', size: '420 KB', date: '15 Nov' },
            ].map((f, i) => (
              <div key={i} className="flex items-center justify-between p-2 border border-ink bg-cream-50 font-medium">
                <span className="truncate">{f.name}</span>
                <span className="text-[10px] font-mono text-ink-muted">{f.size}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Lock className="w-4 h-4 text-coral" />
            SENSITIVE DATA PROTECTION
          </h3>
          <p className="text-xs text-ink-muted leading-relaxed">
            Personal identity cards, banking credentials and tax identifiers are encrypted at rest with AES-256-GCM. Unmasking requires re-entering the owner authentication secret.
          </p>
          <div className="p-3 border-2 border-ink bg-yellow/20 text-xs font-mono">
            <span>PROTECTION LEVEL: AES-256 ENCRYPTED AT REST</span>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DrivePage;
