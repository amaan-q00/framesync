'use client';

import React from 'react';
import { Pencil, Lock, Unlock } from 'lucide-react';

export interface DrawLockBarProps {
  lockedBy: string | null;
  currentUserName: string | null;
  isAuthenticated: boolean;
  onRequestLock: () => void;
  onReleaseLock: () => void;
}

export function DrawLockBar({
  lockedBy,
  currentUserName,
  isAuthenticated,
  onRequestLock,
  onReleaseLock,
}: DrawLockBarProps): React.ReactElement {
  const iHaveLock =
    lockedBy !== null && currentUserName !== null && lockedBy === currentUserName;

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-muted px-2 py-1">
        <Lock size={14} aria-hidden />
        Sign in to draw
      </div>
    );
  }

  if (lockedBy && !iHaveLock) {
    return (
      <div className="flex items-center gap-2 text-xs text-warning px-2 py-1">
        <Lock size={14} aria-hidden />
        Locked by {lockedBy}
      </div>
    );
  }

  if (iHaveLock) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-success flex items-center gap-1">
          <Pencil size={14} aria-hidden />
          You are drawing
        </span>
        <button
          type="button"
          onClick={onReleaseLock}
          className="flex items-center gap-1 rounded px-2 py-1.5 min-h-[36px] text-xs bg-elevated border border-border text-fg hover:bg-surface transition-colors duration-150"
        >
          <Unlock size={14} aria-hidden />
          Release lock
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRequestLock}
      className="flex items-center gap-1.5 rounded px-2 py-1.5 min-h-[36px] text-xs bg-elevated border border-border text-fg hover:bg-surface transition-colors duration-150"
    >
      <Pencil size={14} aria-hidden />
      Request draw lock
    </button>
  );
}
