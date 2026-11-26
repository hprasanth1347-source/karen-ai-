import React, { useState } from 'react';
import { PageHeader, SegmentedControl, Skeleton } from '../components/ui';

export const DesignSystemPage: React.FC = () => {
  const [tab, setTab] = useState<'buttons' | 'inputs' | 'feedback'>('buttons');

  return (
    <div className="space-y-6">
      <PageHeader
        badge="DESIGN SYSTEM"
        title="Karen AI Neo-Brutalist Tokens & Primitives"
        description="WCAG 2.2 AA contrast-verified light & dark tokens, 44px touch targets, and responsive primitives."
      />

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { id: 'buttons', label: 'Buttons & Badges' },
          { id: 'inputs', label: 'Inputs & Cards' },
          { id: 'feedback', label: 'Skeletons & Alerts' },
        ]}
      />

      {tab === 'buttons' && (
        <div className="card-brutal space-y-4">
          <h2 className="text-base font-black">Buttons (Ink on Coral/Teal/Yellow for AA Contrast)</h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-coral text-xs">Primary Coral</button>
            <button type="button" className="btn-teal text-xs">Secondary Teal</button>
            <button type="button" className="btn-yellow text-xs">Accent Yellow</button>
            <button type="button" className="btn-ghost text-xs">Ghost</button>
            <button type="button" className="btn-coral text-xs" disabled>Disabled</button>
          </div>
        </div>
      )}

      {tab === 'inputs' && (
        <div className="card-brutal space-y-3 max-w-md">
          <label htmlFor="ds-input" className="block text-xs font-bold">Accessible Input (16px on mobile)</label>
          <input id="ds-input" type="text" placeholder="Type here..." className="w-full border-2 border-ink bg-surface p-2.5 text-base sm:text-xs" />
        </div>
      )}

      {tab === 'feedback' && (
        <div className="card-brutal space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
    </div>
  );
};

export default DesignSystemPage;
