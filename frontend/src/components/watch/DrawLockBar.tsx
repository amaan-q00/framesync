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
      <div className="flex items-center gap-2 text-xs text-gray-500 px-2 py-1">
        <Lock size={14} />
        Sign in to draw
      </div>
    );
  }

  if (lockedBy && !iHaveLock) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-400 px-2 py-1">
        <Lock size={14} />
        Locked by {lockedBy}
      </div>
    );
  }

  if (iHaveLock) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-400 flex items-center gap-1">
          <Pencil size={14} />
          You are drawing
        </span>
        <button
          type="button"
          onClick={onReleaseLock}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-gray-700 text-white hover:bg-gray-600"
        >
          <Unlock size={14} />
          Release lock
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRequestLock}
      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs bg-gray-700 text-white hover:bg-gray-600"
    >
      <Pencil size={14} />
      Request draw lock
    </button>
  );
}
