'use client';

import React from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  message: string;
  type?: ToastVariant;
  onClose: () => void;
}

const variantStyles: Record<
  ToastVariant,
  { border: string; iconBg: string; icon: React.ReactNode }
> = {
  success: {
    border: 'border-l-success',
    iconBg: 'bg-success/20 text-success',
    icon: <Check className="w-4 h-4 shrink-0" aria-hidden />,
  },
  error: {
    border: 'border-l-error',
    iconBg: 'bg-error/20 text-error',
    icon: <X className="w-4 h-4 shrink-0" aria-hidden />,
  },
  warning: {
    border: 'border-l-warning',
    iconBg: 'bg-warning/20 text-warning',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />,
  },
  info: {
    border: 'border-l-info',
    iconBg: 'bg-info/20 text-info',
    icon: <Info className="w-4 h-4 shrink-0" aria-hidden />,
  },
};

export function Toast({
  message,
  type = 'info',
  onClose,
}: ToastProps): React.ReactElement {
  const style = variantStyles[type];

  return (
    <div
      role="alert"
      className={`
        flex items-start gap-3 w-full max-w-sm rounded-lg border border-border border-l-4
        bg-elevated px-4 py-3 shadow-lg
        toast-enter
        ${style.border}
      `}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}
      >
        {style.icon}
      </span>
      <p className="flex-1 text-sm font-medium text-fg pt-1">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-fg-muted hover:bg-surface hover:text-fg focus:outline-none focus:ring-2 focus:ring-primary transition-colors duration-150"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

export default Toast;
