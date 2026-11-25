import React, { useState } from 'react'
import clsx from 'clsx'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  maxChars?: number
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, maxChars, className, id, onChange, ...props }, ref) => {
    const [count, setCount] = useState(0)
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCount(e.target.value.length)
      onChange?.(e)
    }

    return (
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-bold text-ink">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={clsx('input-brutal resize-y min-h-[100px]', error && 'border-coral', className)}
          onChange={handleChange}
          maxLength={maxChars}
          {...props}
        />
        <div className="flex justify-between">
          {error ? <p className="text-xs text-coral font-semibold">{error}</p> : helperText ? <p className="text-xs text-ink/60">{helperText}</p> : <span />}
          {maxChars && <p className="text-xs text-ink/60">{count}/{maxChars}</p>}
        </div>
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'
