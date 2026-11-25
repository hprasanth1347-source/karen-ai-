import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, LucideIcon } from 'lucide-react';
import clsx from 'clsx';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const configs: Record<AlertVariant, { icon: LucideIcon; bg: string; text: string }> = {
  info:    { icon: Info,          bg: 'bg-teal/10 border-teal',    text: 'text-teal-600' },
  success: { icon: CheckCircle,   bg: 'bg-mint/10 border-mint',    text: 'text-mint-600' },
  warning: { icon: AlertTriangle, bg: 'bg-yellow/20 border-yellow', text: 'text-yellow-600' },
  error:   { icon: AlertCircle,   bg: 'bg-coral/10 border-coral',  text: 'text-coral-700' },
};

export const Alert: React.FC<AlertProps> = ({ variant = 'info', title, children, className }) => {
  const { icon: Icon, bg, text } = configs[variant];
  return (
    <div className={clsx('border-2 p-4 flex gap-3', bg, className)}>
      <Icon size={20} className={clsx('shrink-0 mt-0.5', text)} />
      <div>
        {title && <p className={clsx('font-bold text-sm mb-1', text)}>{title}</p>}
        <div className="text-sm text-ink/80">{children}</div>
      </div>
    </div>
  );
};
export default Alert;
