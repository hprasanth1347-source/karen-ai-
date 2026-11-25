import React from 'react'
import clsx from 'clsx'

type BadgeVariant = 'active' | 'error' | 'pending' | 'inactive' | 'coral' | 'teal' | 'electric' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  active:   'bg-mint text-white',
  error:    'bg-coral text-white',
  pending:  'bg-yellow text-ink',
  inactive: 'bg-ink/20 text-ink',
  coral:    'bg-coral text-white',
  teal:     'bg-teal text-white',
  electric: 'bg-electric text-white',
  default:  'bg-cream text-ink',
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className }) => (
  <span className={clsx('badge-brutal', variantClasses[variant], className)}>
    {children}
  </span>
)
