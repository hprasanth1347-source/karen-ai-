import React from 'react'
import clsx from 'clsx'

interface Tab {
  key: string
  label: string
  icon?: React.ReactNode
  badge?: number
}

interface TabsProps {
  tabs: Tab[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeKey, onChange, className }) => (
  <div className={clsx('flex border-b-2 border-ink', className)}>
    {tabs.map((tab) => (
      <button
        key={tab.key}
        onClick={() => onChange(tab.key)}
        className={clsx(
          'flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-4 -mb-0.5 transition-all',
          activeKey === tab.key
            ? 'border-coral text-coral bg-coral/5'
            : 'border-transparent text-ink/60 hover:text-ink hover:border-ink/30'
        )}
      >
        {tab.icon}
        {tab.label}
        {tab.badge !== undefined && tab.badge > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-coral text-white font-bold border border-ink">
            {tab.badge}
          </span>
        )}
      </button>
    ))}
  </div>
)
