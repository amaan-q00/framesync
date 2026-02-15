'use client';

import React from 'react';
import { Play, Pause } from 'lucide-react';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface VideoControlBarProps {
  currentTime: number;
  duration: number;
  fps: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onPlay: () => void;
  onPause: () => void;
  disabled?: boolean;
  className?: string;
}

export function VideoControlBar({
  currentTime,
  duration,
  fps,
  isPlaying,
  onSeek,
  onPlay,
  onPause,
  disabled = false,
  className = '',
}: VideoControlBarProps): React.ReactElement {
  const maxFrame = Math.max(0, Math.floor(duration * fps));
  const currentFrame = Math.round(currentTime * fps);

  const handleSeekSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    const t = (pct / 100) * (duration || 1);
    onSeek(t);
  };

  const skipFrames = (delta: number) => {
    const frame = Math.max(0, Math.min(maxFrame, currentFrame + delta));
    onSeek(frame / fps);
  };

  const seekPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg bg-surface border border-border px-3 py-2 ${className}`}
      aria-label="Video controls"
    >
      <button
        type="button"
        onClick={isPlaying ? onPause : onPlay}
        disabled={disabled}
        className="rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-fg hover:bg-elevated disabled:opacity-50 transition-colors duration-150"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden />}
      </button>

      <span className="text-sm text-fg tabular-nums">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <span className="text-xs text-fg-muted tabular-nums" title="Current frame / total frames">
        Frame {currentFrame} / {maxFrame}
      </span>

      <div className="flex-1 min-w-[80px] max-w-[200px]">
        <input
          type="range"
          min={0}
          max={100}
          value={seekPercent}
          onChange={handleSeekSlider}
          disabled={disabled}
          className="w-full h-1.5 rounded accent-primary disabled:opacity-50"
          aria-label="Seek"
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs text-fg-muted">Frame</span>
        <button
          type="button"
          onClick={() => skipFrames(-10)}
          disabled={disabled || currentFrame <= 0}
          className="rounded px-2 py-1.5 min-h-[36px] text-xs bg-elevated text-fg hover:bg-border disabled:opacity-50 font-medium transition-colors duration-150"
          aria-label="Back 10 frames"
          title="Back 10 frames"
        >
          &laquo;
        </button>
        <button
          type="button"
          onClick={() => skipFrames(-1)}
          disabled={disabled || currentFrame <= 0}
          className="rounded px-2 py-1.5 min-h-[36px] text-xs bg-elevated text-fg hover:bg-border disabled:opacity-50 transition-colors duration-150"
          aria-label="Previous frame"
          title="Back 1 frame"
        >
          &lsaquo;
        </button>
        <button
          type="button"
          onClick={() => skipFrames(1)}
          disabled={disabled || currentFrame >= maxFrame}
          className="rounded px-2 py-1.5 min-h-[36px] text-xs bg-elevated text-fg hover:bg-border disabled:opacity-50 transition-colors duration-150"
          aria-label="Next frame"
          title="Forward 1 frame"
        >
          &rsaquo;
        </button>
        <button
          type="button"
          onClick={() => skipFrames(10)}
          disabled={disabled || currentFrame >= maxFrame}
          className="rounded px-2 py-1.5 min-h-[36px] text-xs bg-elevated text-fg hover:bg-border disabled:opacity-50 font-medium transition-colors duration-150"
          aria-label="Forward 10 frames"
          title="Forward 10 frames"
        >
          &raquo;
        </button>
      </div>
    </div>
  );
}
