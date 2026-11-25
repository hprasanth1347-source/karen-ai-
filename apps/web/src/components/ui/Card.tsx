import React from 'react'
import clsx from 'clsx'

interface CardProps {
  children: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
  className?: string
}

const paddingClasses = {
  none: 'p-0',
  sm:   'p-2',
  md:   'p-4',
  lg:   'p-6',
}

export const Card: React.FC<CardProps> = ({ children, header, footer, padding = 'md', className }) => (
  <div className={clsx('card-brutal flex flex-col', className)}>
    {header && (
      <div className="border-b-2 border-ink pb-3 mb-3 font-bold text-sm uppercase tracking-wide">
        {header}
      </div>
    )}
    <div className={paddingClasses[padding]}>{children}</div>
    {footer && (
      <div className="border-t-2 border-ink pt-3 mt-3 text-sm text-ink/70">
        {footer}
      </div>
    )}
  </div>
)
