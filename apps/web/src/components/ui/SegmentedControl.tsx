import React from 'react';

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = 'View options',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex overflow-x-auto max-w-full border-2 border-ink bg-cream-50"
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={`px-3 py-2 text-xs font-bold border-r border-ink last:border-r-0 whitespace-nowrap ${
            value === opt.id ? 'bg-coral text-[#0A0A0A]' : 'bg-surface text-ink hover:bg-yellow/40'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
