'use client';

import React from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  message: string;
  type?: ToastVariant;
  onClose: () => void;
}

const variantStyles: Record<ToastVariant, { border: string; iconBg: string; icon: React.ReactNode }> = {
  success: {
    border: 'border-l-green-500',
    iconBg: 'bg-green-100 text-green-600',
    icon: <Check className="w-4 h-4 shrink-0" aria-hidden />,
  },
  error: {
    border: 'border-l-red-500',
    iconBg: 'bg-red-100 text-red-600',
    icon: <X className="w-4 h-4 shrink-0" aria-hidden />,
  },
  warning: {
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-100 text-amber-700',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />,
  },
  info: {
    border: 'border-l-blue-500',
    iconBg: 'bg-blue-100 text-blue-600',
    icon: <Info className="w-4 h-4 shrink-0" aria-hidden />,
  },
};

export function Toast({ message, type = 'info', onClose }: ToastProps): React.ReactElement {
  const style = variantStyles[type];

  return (
    <div
      role="alert"
      className={`
        flex items-start gap-3 w-full max-w-sm rounded-lg border border-gray-200 border-l-4
        bg-white px-4 py-3 shadow-sm
        toast-enter
        ${style.border}
      `}
    >
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}>
        {style.icon}
      </span>
      <p className="flex-1 text-sm font-medium text-gray-900 pt-1">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default Toast;
