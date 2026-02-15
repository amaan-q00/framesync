'use client';

import React from 'react';

export interface ActivityBarProps {
  entries: Array<{ id: string; message: string; timestamp: number }>;
  className?: string;
}

export function ActivityBar({ entries, className = '' }: ActivityBarProps): React.ReactElement {
  if (entries.length === 0) return <div className={className} />;
  return (
    <div
      className={`flex items-center gap-2 overflow-x-auto rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted ${className}`}
      role="log"
      aria-live="polite"
    >
      {entries.slice(-5).map((e) => (
        <span key={e.id} className="shrink-0 rounded bg-elevated px-2 py-0.5 text-fg">
          {e.message}
        </span>
      ))}
    </div>
  );
}
