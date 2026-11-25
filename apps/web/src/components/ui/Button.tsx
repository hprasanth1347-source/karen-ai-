import React from 'react'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

type Variant = 'coral' | 'teal' | 'ghost' | 'yellow' | 'magenta' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  coral:   'bg-coral text-white hover:bg-coral-600 border-ink',
  teal:    'bg-teal text-white hover:bg-teal-600 border-ink',
  ghost:   'bg-cream text-ink hover:bg-cream-200 border-ink',
  yellow:  'bg-yellow text-ink hover:bg-yellow-600 border-ink',
  magenta: 'bg-magenta text-white hover:bg-magenta-600 border-ink',
  danger:  'bg-red-500 text-white hover:bg-red-600 border-ink',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', size = 'md', loading, icon, iconRight, children, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center gap-2 font-bold border-2 shadow-brutal',
        'transition-all duration-100',
        'hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-brutal-lg',
        'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-brutal',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={14} /> : icon}
      {children}
      {iconRight && !loading && iconRight}
    </button>
  )
)
Button.displayName = 'Button'
