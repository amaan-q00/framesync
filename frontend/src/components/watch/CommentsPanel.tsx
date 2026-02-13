'use client';

import React, { useState } from 'react';
import { MessageSquare, MapPin, Trash2 } from 'lucide-react';
import type { Comment } from '@/types/video';
import { videoApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface MarkerSegment {
  startTime: number;
  endTime: number;
  strokes: Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>;
}

export interface MarkerModeState {
  segments: MarkerSegment[];
  label: string;
  /** When set: video is frozen, user is drawing this segment */
  segmentStartTime?: number;
  segmentStrokes: Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>;
}

export interface CommentsPanelProps {
  videoId: string;
  token?: string;
  role: string;
  comments: Comment[];
  currentTime: number;
  canEdit: boolean;
  isGuest: boolean;
  guestName: string;
  onGuestNameSubmit: (name: string) => void;
  addComment: (c: Comment) => void;
  removeComment: (commentId: string) => void;
  onError: (msg: string) => void;
  /** Seek to time; if comment provided (marker/shape), parent may play to end of marker then pause */
  onSeekToTimestamp?: (timestamp: number, comment?: Comment) => void;
  /** When adding a marker: Add marker -> Draw (freeze) -> draw -> Done drawing (resume) -> repeat -> End marker */
  markerMode: MarkerModeState | null;
  onStartMarker: () => void;
  onStartDraw: () => void;
  onDoneDrawing: () => void;
  onCancelDrawing?: () => void;
  onEndMarker: (label: string) => void;
  onMarkerLabelChange: (label: string) => void;
  markerSaving?: boolean;
}

export function CommentsPanel({
  videoId,
  token,
  role,
  comments,
  currentTime,
  canEdit,
  isGuest,
  guestName,
  onGuestNameSubmit,
  addComment,
  removeComment,
  onError,
  onSeekToTimestamp,
  markerMode,
  onStartMarker,
  onStartDraw,
  onDoneDrawing,
  onCancelDrawing,
  onEndMarker,
  onMarkerLabelChange,
  markerSaving = false,
}: CommentsPanelProps): React.ReactElement {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [guestInput, setGuestInput] = useState(guestName);

  const needsGuestName = isGuest && canEdit && !guestName;

  const handleAddChat = async () => {
    if (!canEdit) return;
    if (isGuest && !guestName) {
      if (guestInput.trim()) onGuestNameSubmit(guestInput.trim());
      return;
    }
    const content = text.trim();
    if (!content) return;
    setSubmitting(true);
    try {
      const res = await videoApi.addComment(
        videoId,
        { text: content, timestamp: currentTime, type: 'chat', ...(isGuest && { guestName }) },
        token
      );
      addComment(res.data);
      setText('');
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartMarker = () => {
    if (!canEdit) return;
    if (isGuest && !guestName) {
      if (guestInput.trim()) onGuestNameSubmit(guestInput.trim());
      return;
    }
    onStartMarker();
  };

  const handleEndMarker = () => {
    if (!markerMode) return;
    onEndMarker(markerMode.label);
  };

  const handleDelete = async (commentId: string) => {
    try {
      await videoApi.deleteComment(videoId, commentId, token);
      removeComment(commentId);
    } catch (err) {
      onError(getErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800/80 rounded-lg border border-gray-700">
      <div className="p-2 border-b border-gray-700 flex items-center gap-2">
        <MessageSquare size={18} className="text-gray-400" />
        <span className="text-sm font-medium text-white">Comments & markers</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {needsGuestName && (
          <div className="flex flex-col gap-2 p-2 bg-gray-700/50 rounded">
            <label className="text-xs text-gray-400">Enter your name to comment</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                placeholder="Your name"
                className="flex-1 rounded px-2 py-1.5 text-sm bg-gray-800 border border-gray-600 text-white placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => guestInput.trim() && onGuestNameSubmit(guestInput.trim())}
                className="rounded px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-500"
              >
                Continue
              </button>
            </div>
          </div>
        )}
        {comments.length === 0 && !needsGuestName && (
          <p className="text-xs text-gray-500 py-2">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className="rounded p-2 bg-gray-700/40 text-sm flex items-start justify-between gap-2"
          >
            <div
              className="min-w-0 flex-1 cursor-pointer"
              onClick={() => onSeekToTimestamp?.(c.timestamp, c)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && onSeekToTimestamp) {
                  e.preventDefault();
                  onSeekToTimestamp(c.timestamp, c);
                }
              }}
              role={onSeekToTimestamp ? 'button' : undefined}
              tabIndex={onSeekToTimestamp ? 0 : undefined}
              title={onSeekToTimestamp ? `Jump to ${formatTime(c.timestamp)}${(c.type === 'marker' || c.type === 'shape') ? ' (play to end)' : ''}` : undefined}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-400 font-medium truncate">
                  {c.user_name ?? c.guest_name ?? 'Guest'}
                </span>
                <span className="text-gray-500 text-xs">{formatTime(c.timestamp)}</span>
                {c.type === 'marker' && (
                  <MapPin size={14} className="text-amber-400 shrink-0" aria-hidden />
                )}
              </div>
              {c.type === 'shape' ? (
                <p className="text-gray-400 italic">Drawing</p>
              ) : (
                <p className="text-white break-words">{c.text || '—'}</p>
              )}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(c.id);
                }}
                className="shrink-0 p-1 text-gray-400 hover:text-red-400"
                aria-label="Delete comment"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (guestName || !isGuest) && (
        <div className="p-2 border-t border-gray-700 space-y-2">
          {markerMode ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-400">
                {markerMode.segmentStartTime != null
                  ? 'Drawing — click Done drawing to resume video, or add more segments.'
                  : 'Adding marker — click Draw to freeze and draw, or add label and End marker.'}
              </p>
              {markerMode.segmentStartTime == null ? (
                <button
                  type="button"
                  onClick={onStartDraw}
                  className="w-full rounded px-2 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-500 flex items-center justify-center gap-1.5"
                >
                  <MapPin size={14} />
                  Draw
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onDoneDrawing}
                    className="flex-1 rounded px-2 py-1.5 text-sm bg-green-600 text-white hover:bg-green-500 flex items-center justify-center gap-1.5"
                  >
                    Done drawing
                  </button>
                  {onCancelDrawing && (
                    <button
                      type="button"
                      onClick={onCancelDrawing}
                      className="rounded px-2 py-1.5 text-sm bg-gray-600 text-white hover:bg-gray-500 flex items-center justify-center"
                      title="Cancel current drawing (discard this segment)"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
              {markerMode.segments.length > 0 && (
                <p className="text-xs text-gray-400">{markerMode.segments.length} segment(s)</p>
              )}
              <input
                type="text"
                value={markerMode.label}
                onChange={(e) => onMarkerLabelChange(e.target.value)}
                placeholder="Label for marker (optional)"
                className="w-full rounded px-2 py-1.5 text-sm bg-gray-800 border border-gray-600 text-white placeholder-gray-500"
              />
              <button
                type="button"
                onClick={handleEndMarker}
                disabled={submitting || markerSaving || markerMode.segmentStartTime != null}
                className="w-full rounded px-2 py-1.5 text-sm bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 flex items-center justify-center gap-1.5"
                title={markerMode.segmentStartTime != null ? 'Finish or cancel current drawing first' : undefined}
              >
                <MapPin size={14} />
                End marker
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddChat()}
                  placeholder="Add comment at current time..."
                  className="flex-1 rounded px-2 py-1.5 text-sm bg-gray-800 border border-gray-600 text-white placeholder-gray-500"
                />
                <button
                  type="button"
                  onClick={handleAddChat}
                  disabled={submitting}
                  className="rounded px-3 py-1.5 text-sm bg-gray-600 text-white hover:bg-gray-500 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <button
                type="button"
                onClick={handleStartMarker}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-amber-400 hover:bg-gray-700"
              >
                <MapPin size={14} />
                Add marker
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
