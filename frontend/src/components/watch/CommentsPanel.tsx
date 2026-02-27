'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, MapPin, Trash2, Send, Check, XCircle } from 'lucide-react';
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
  segmentStartTime?: number;
  segmentStrokes: Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>;
}

export interface CommentsPanelProps {
  videoId: string;
  token?: string;
  role: string;
  comments: Comment[];
  currentTime: number;
  canAddComment: boolean;
  canDeleteAny: boolean;
  canDeleteOwn: boolean;
  currentUserId?: number;
  isGuest: boolean;
  guestName: string;
  onGuestNameSubmit: (name: string) => void;
  addComment: (c: Comment) => void;
  removeComment: (commentId: string) => void;
  onError: (msg: string) => void;
  onSeekToTimestamp?: (timestamp: number, comment?: Comment) => void;
  markerMode: MarkerModeState | null;
  quickMarkerPopup: { timestamp: number } | null;
  endMarkerPopup: { segments: MarkerSegment[] } | null;
  onRequestQuickMarker: () => void;
  onQuickMarkerSubmit: (label: string) => void;
  onQuickMarkerCancel: () => void;
  onStartMarkerWithDrawing: () => void;
  onStartDraw: () => void;
  onDoneDrawing: () => void;
  onCancelDrawing?: () => void;
  onRequestEndMarker: () => void;
  onEndMarkerSubmit: (label: string) => void;
  onEndMarkerCancel: () => void;
  markerSaving?: boolean;
  canAddMarkersInLive?: boolean;
}

export function CommentsPanel({
  videoId,
  token,
  role,
  comments,
  currentTime,
  canAddComment,
  canDeleteAny,
  canDeleteOwn,
  currentUserId,
  isGuest,
  guestName,
  onGuestNameSubmit,
  addComment,
  removeComment,
  onError,
  onSeekToTimestamp,
  markerMode,
  quickMarkerPopup,
  endMarkerPopup,
  onRequestQuickMarker,
  onQuickMarkerSubmit,
  onQuickMarkerCancel,
  onStartMarkerWithDrawing,
  onStartDraw,
  onDoneDrawing,
  onCancelDrawing,
  onRequestEndMarker,
  onEndMarkerSubmit,
  onEndMarkerCancel,
  markerSaving = false,
  canAddMarkersInLive = true,
}: CommentsPanelProps): React.ReactElement {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [guestInput, setGuestInput] = useState(guestName);
  const [popupLabel, setPopupLabel] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const markerFlowActive = markerMode != null || quickMarkerPopup != null || endMarkerPopup != null;

  const needsGuestName = isGuest && canAddComment && !guestName;

  const canDeleteComment = (c: Comment) =>
    canDeleteAny ||
    (canDeleteOwn &&
      (c.user_id != null ? c.user_id === currentUserId : isGuest && c.guest_name === guestName));

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length, comments]);

  const handleAddChat = async () => {
    if (!canAddComment) return;
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

  useEffect(() => {
    if (quickMarkerPopup != null || endMarkerPopup != null) setPopupLabel('');
  }, [quickMarkerPopup, endMarkerPopup]);

  const handleQuickMarkerClick = () => {
    if (!canAddMarkersInLive) return;
    if (isGuest && !guestName) {
      if (guestInput.trim()) onGuestNameSubmit(guestInput.trim());
      return;
    }
    onRequestQuickMarker();
  };

  const handlePopupSubmit = (kind: 'quick' | 'end') => {
    const label = popupLabel.trim();
    if (kind === 'quick') onQuickMarkerSubmit(label);
    else onEndMarkerSubmit(label);
    setPopupLabel('');
  };

  const handleDelete = async (commentId: string) => {
    try {
      await videoApi.deleteComment(videoId, commentId, token, isGuest && guestName ? { guestName } : undefined);
      removeComment(commentId);
    } catch (err) {
      onError(getErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface rounded-lg border border-border">
      <div className="p-2 border-b border-border flex items-center gap-2">
        <MessageSquare size={18} className="text-fg-muted shrink-0" aria-hidden />
        <span className="text-sm font-medium text-fg">Comments & markers</span>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2 min-h-0 flex flex-col">
        {needsGuestName && (
          <div className="flex flex-col gap-2 p-2 bg-elevated rounded-lg">
            <label className="text-xs text-fg-muted">Enter your name to comment</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                placeholder="Your name"
                className="flex-1 rounded px-2 py-1.5 text-sm bg-page border border-border text-fg placeholder:text-fg-muted focus:ring-2 focus:ring-primary focus:border-primary transition-[border-color,box-shadow] duration-150"
              />
              <button
                type="button"
                onClick={() => guestInput.trim() && onGuestNameSubmit(guestInput.trim())}
                className="rounded px-3 py-1.5 min-h-[44px] text-sm bg-primary text-white hover:opacity-90 transition-opacity"
              >
                Continue
              </button>
            </div>
          </div>
        )}
        {comments.length === 0 && !needsGuestName && (
          <p className="text-xs text-fg-muted py-2">No comments yet.</p>
        )}
        {[...comments].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()).map((c) => {
          const displayName = c.user_name ?? c.guest_name ?? 'Guest';
          const initials = displayName.slice(0, 2).toUpperCase();
          return (
            <div
              key={c.id}
              className="rounded-lg p-2 bg-elevated text-sm flex items-start gap-3 border border-border-subtle"
            >
              <div className="shrink-0 mt-0.5">
                {c.user_avatar ? (
                  <img
                    src={c.user_avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover bg-elevated border border-border"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-medium border border-border">
                    {initials}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="cursor-pointer"
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
                    <span className="text-fg-muted font-medium truncate">
                      {displayName}
                    </span>
                    <span className="text-fg-muted text-xs">{formatTime(c.timestamp)}</span>
                    {c.type === 'marker' && (
                      <MapPin size={14} className="text-warning shrink-0" aria-hidden />
                    )}
                  </div>
                  {c.type === 'shape' ? (
                    <p className="text-fg-muted italic">Drawing</p>
                  ) : (
                    <p className="text-fg break-words">{c.text || '—'}</p>
                  )}
                </div>
              </div>
              {canDeleteComment(c) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(c.id);
                  }}
                  className="shrink-0 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-fg-muted hover:text-danger transition-colors duration-150"
                  aria-label="Delete comment"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </div>
          );
        })}
        <div ref={commentsEndRef} />
      </div>
      {(quickMarkerPopup != null || endMarkerPopup != null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="marker-popup-title">
          <div className="bg-elevated border border-border rounded-lg shadow-xl max-w-sm w-full p-4 space-y-3">
            <h2 id="marker-popup-title" className="text-sm font-medium text-fg">
              {quickMarkerPopup != null ? 'Quick marker label' : 'Marker label'}
            </h2>
            <input
              type="text"
              value={popupLabel}
              onChange={(e) => setPopupLabel(e.target.value)}
              placeholder="Label"
              className="w-full rounded px-2 py-1.5 text-sm bg-page border border-border text-fg placeholder:text-fg-muted focus:ring-2 focus:ring-primary focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePopupSubmit(quickMarkerPopup != null ? 'quick' : 'end');
                if (e.key === 'Escape') quickMarkerPopup != null ? onQuickMarkerCancel() : onEndMarkerCancel();
              }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={quickMarkerPopup != null ? onQuickMarkerCancel : onEndMarkerCancel}
                className="rounded px-3 py-1.5 text-sm bg-elevated border border-border text-fg hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handlePopupSubmit(quickMarkerPopup != null ? 'quick' : 'end')}
                disabled={markerSaving || !popupLabel.trim()}
                className="rounded px-3 py-1.5 text-sm bg-primary text-white hover:opacity-90 disabled:opacity-50"
              >
                {markerSaving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {canAddComment && (guestName || !isGuest) && (
        <div className="p-2 border-t border-border space-y-2">
          {markerMode != null && canAddMarkersInLive ? (
            <div className="space-y-2">
              {markerMode.segmentStartTime != null ? (
                <>
                  <p className="text-xs text-warning">
                    Video paused — draw on the video, then click Done drawing to add this segment (or Cancel).
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onDoneDrawing}
                      className="flex-1 rounded px-2 py-2 min-h-[44px] text-sm bg-success text-white hover:opacity-90 flex items-center justify-center gap-1.5"
                    >
                      <Check size={16} aria-hidden />
                      Done drawing
                    </button>
                    {onCancelDrawing && (
                      <button
                        type="button"
                        onClick={onCancelDrawing}
                        className="rounded px-2 py-2 min-h-[44px] text-sm bg-elevated border border-border text-fg hover:bg-surface"
                        title="Cancel this segment and resume video"
                      >
                        <XCircle size={16} aria-hidden />
                        Cancel
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-fg-muted">
                    {markerMode.segments.length > 0 ? `${markerMode.segments.length} segment(s). Add another or end.` : 'Draw on the video, or add more segments.'}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={onStartDraw}
                      className="rounded px-2 py-2 min-h-[44px] text-sm bg-primary text-white hover:opacity-90 flex items-center justify-center gap-1.5"
                    >
                      <MapPin size={14} aria-hidden />
                      Draw
                    </button>
                    <button
                      type="button"
                      onClick={onRequestEndMarker}
                      disabled={submitting || markerSaving}
                      className="rounded px-2 py-2 min-h-[44px] text-sm bg-warning text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <MapPin size={14} aria-hidden />
                      End marker
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddChat()}
                  placeholder={markerFlowActive ? 'Finish marker flow to add comments' : 'Add comment at current time...'}
                  className="flex-1 rounded px-2 py-1.5 text-sm bg-page border border-border text-fg placeholder:text-fg-muted focus:ring-2 focus:ring-primary focus:border-primary"
                  disabled={markerFlowActive}
                />
                <button
                  type="button"
                  onClick={handleAddChat}
                  disabled={submitting || markerFlowActive}
                  className="rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-primary text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                  aria-label="Send comment"
                >
                  <Send size={20} aria-hidden />
                </button>
              </div>
              <p className="text-xs text-fg-muted">
                Ephemeral draw: only in live session. Quick marker (1s) or Marker with drawing (pause → draw → end).
              </p>
              {canAddMarkersInLive && !markerFlowActive && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleQuickMarkerClick}
                    disabled={submitting || markerSaving}
                    className="rounded px-2 py-2 min-h-[44px] text-xs bg-elevated border border-border text-fg hover:bg-surface flex items-center gap-1.5"
                    title="Capture current time, then add label in popup (video keeps playing)"
                  >
                    <MapPin size={14} aria-hidden />
                    Quick marker (1s)
                  </button>
                  <button
                    type="button"
                    onClick={onStartMarkerWithDrawing}
                    disabled={submitting || markerSaving}
                    className="rounded px-2 py-2 min-h-[44px] text-xs text-warning hover:bg-elevated border border-warning/50 flex items-center gap-1.5"
                    title="Pause, draw, add segments, then End marker and add label in popup"
                  >
                    <MapPin size={14} aria-hidden />
                    Marker with drawing
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
