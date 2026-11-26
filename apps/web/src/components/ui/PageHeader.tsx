import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, badge, actions }) => (
  <div className="bg-surface border-3 border-ink p-4 md:p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div className="min-w-0">
      {badge && (
        <span className="inline-block px-2 py-0.5 bg-coral text-[#0A0A0A] text-[11px] font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
          {badge}
        </span>
      )}
      <h1 className="text-xl md:text-2xl font-black text-ink break-words">{title}</h1>
      {description && <p className="text-xs md:text-sm text-ink-muted mt-1">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);
