import React from 'react'
import clsx from 'clsx'

type StatusColor = 'green' | 'red' | 'yellow' | 'gray'

interface StatusDotProps {
  color?: StatusColor
  pulse?: boolean
  className?: string
}

const colorClasses: Record<StatusColor, string> = {
  green:  'bg-mint',
  red:    'bg-coral',
  yellow: 'bg-yellow',
  gray:   'bg-ink/30',
}

export const StatusDot: React.FC<StatusDotProps> = ({ color = 'gray', pulse = false, className }) => (
  <span className={clsx('inline-block w-2.5 h-2.5 rounded-full border border-ink', colorClasses[color], pulse && 'animate-pulse', className)} />
)
