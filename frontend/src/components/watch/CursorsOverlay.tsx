'use client';

import React from 'react';
import type { RemoteCursorPayload } from '@/types/watch';

export interface CursorsOverlayProps {
  cursors: Map<number, RemoteCursorPayload>;
  className?: string;
}

export function CursorsOverlay({ cursors, className = '' }: CursorsOverlayProps): React.ReactElement {
  const list = Array.from(cursors.entries());

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden>
      {list.map(([userId, payload]) => (
        <div
          key={userId}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
          style={{
            left: `${payload.x * 100}%`,
            top: `${payload.y * 100}%`,
          }}
        >
          <div
            className="w-3 h-3 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: payload.color }}
          />
          <span className="text-xs text-white whitespace-nowrap mt-0.5 drop-shadow-md bg-black/50 px-1 rounded">
            {payload.name}
          </span>
        </div>
      ))}
    </div>
  );
}
