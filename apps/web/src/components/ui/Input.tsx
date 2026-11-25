import React from 'react'
import clsx from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-bold text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'input-brutal',
            error && 'border-coral focus:ring-coral',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-coral font-semibold">{error}</p>}
        {helperText && !error && <p className="text-xs text-ink/60">{helperText}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
