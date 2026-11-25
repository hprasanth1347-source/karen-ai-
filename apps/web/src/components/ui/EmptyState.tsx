import React from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
    {icon && <div className="text-ink/30">{icon}</div>}
    <h3 className="font-bold text-lg uppercase tracking-wide">{title}</h3>
    {description && <p className="text-sm text-ink/60 max-w-sm">{description}</p>}
    {action && (
      <Button variant="coral" onClick={action.onClick}>
        {action.label}
      </Button>
    )}
  </div>
)
