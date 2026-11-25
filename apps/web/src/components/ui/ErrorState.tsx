import React from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from './Button'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected error occurred.',
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
    <AlertCircle size={40} className="text-coral" />
    <h3 className="font-bold text-lg uppercase tracking-wide">{title}</h3>
    <p className="text-sm text-ink/60 max-w-sm">{message}</p>
    {onRetry && (
      <Button variant="coral" onClick={onRetry} icon={<RefreshCw size={14} />}>
        Retry
      </Button>
    )}
  </div>
)
