'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardSync } from '@/contexts/DashboardSyncContext';
import { videoApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useWatchSocket } from '@/hooks/useWatchSocket';
import { useWatchRoom } from '@/hooks/useWatchRoom';
import { getErrorMessage } from '@/lib/utils';
import { HlsPlayer, type HlsPlayerControlRef } from '@/components/watch/HlsPlayer';
import { VideoControlBar } from '@/components/watch/VideoControlBar';
import { CommentsPanel, type MarkerModeState, type MarkerSegment } from '@/components/watch/CommentsPanel';
import { DrawLockBar } from '@/components/watch/DrawLockBar';
import { DrawingCanvas } from '@/components/watch/DrawingCanvas';
import { CursorsOverlay } from '@/components/watch/CursorsOverlay';

const SYNC_PULSE_INTERVAL_MS = 500;
const CURSOR_THROTTLE_MS = 100;

const PEN_COLORS = [
  '#FF0000',
  '#FF6600',
  '#FFCC00',
  '#00CC00',
  '#0066FF',
  '#6600CC',
  '#FFFFFF',
  '#000000',
];

export default function WatchPage(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const token = searchParams?.get('token') ?? undefined;
  const { isAuthenticated, user } = useAuth();
  const { socket: mainSocket } = useDashboardSync();
  const { error: showError } = useToast();
  const [video, setVideo] = useState<{
    title: string;
    manifestUrl?: string;
    role: string;
    fps: number;
  } | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [guestName, setGuestName] = useState('');
  const [strokeColor, setStrokeColor] = useState('#FF0000');
  const [markerMode, setMarkerMode] = useState<MarkerModeState | null>(null);
  const [markerSaving, setMarkerSaving] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<HlsPlayerControlRef | null>(null);
  const lastSyncPulseRef = useRef(0);
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);
  const pauseAtTimeRef = useRef<number | null>(null);

  const guestSocketEnabled = !isAuthenticated && Boolean(token && id && video);
  const { socket: guestSocket } = useWatchSocket(id, token, guestSocketEnabled);
  const socket = isAuthenticated ? mainSocket : guestSocket ?? null;
  const fps = video?.fps ?? 24;

  const {
    syncState,
    comments,
    setComments,
    addComment,
    removeComment,
    claimHost,
    endSession,
    syncPulse,
    requestDrawLock,
    releaseDrawLock,
    emitCursor,
    emitStroke,
    remoteCursors,
    remoteStrokes,
    clearRemoteStrokes,
  } = useWatchRoom(socket, id, fps, {
    userId: user ? Number(user.id) : undefined,
    onError: showError,
  });

  const isLiveMode = syncState.isLive;
  const isHost = isAuthenticated && syncState.hostId !== null && user && Number(user.id) === syncState.hostId;
  const isPassenger = isLiveMode && syncState.hasRoomState && !isHost;
  const canEdit = video?.role === 'owner' || video?.role === 'editor';
  const iHaveLock = Boolean(
    isLiveMode &&
      isAuthenticated &&
      syncState.lockedBy !== null &&
      user &&
      syncState.lockedBy === user.name
  );

  const backHref = isAuthenticated ? '/dashboard' : '/login';
  const backLabel = isAuthenticated ? 'Dashboard' : 'Sign in';

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    videoApi
      .getVideo(id, token)
      .then((res) => {
        if (!cancelled) {
          setVideo({
            title: res.data.title,
            manifestUrl: res.data.manifestUrl,
            role: res.data.role,
            fps: typeof res.data.fps === 'number' ? res.data.fps : 24,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) showError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, token, showError]);

  useEffect(() => {
    if (!id || !video) return;
    let cancelled = false;
    videoApi
      .getComments(id, token)
      .then((res) => {
        if (!cancelled) setComments(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, token, video, setComments]);

  useEffect(() => {
    const key = `framesync:guest:${id}`;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) setGuestName(stored);
    } catch {
      // ignore
    }
  }, [id]);

  const handleGuestNameSubmit = useCallback(
    (name: string) => {
      setGuestName(name);
      try {
        sessionStorage.setItem(`framesync:guest:${id}`, name);
      } catch {
        // ignore
      }
    },
    [id]
  );

  const handleTimeUpdate = useCallback(
    (time: number) => {
      if (!isLiveMode || !isHost) return;
      const now = Date.now();
      if (now - lastSyncPulseRef.current < SYNC_PULSE_INTERVAL_MS) return;
      lastSyncPulseRef.current = now;
      const frame = Math.round(time * fps);
      syncPulse({ timestamp: time, state: 'playing', frame });
    },
    [isLiveMode, isHost, fps, syncPulse]
  );

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    if (!isLiveMode || !isHost || !playerRef.current) return;
    const t = playerRef.current.getCurrentTime();
    const frame = Math.round(t * fps);
    syncPulse({ timestamp: t, state: 'playing', frame });
  }, [isLiveMode, isHost, fps, syncPulse]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    if (!isLiveMode || !isHost || !playerRef.current) return;
    const t = playerRef.current.getCurrentTime();
    const frame = Math.round(t * fps);
    syncPulse({ timestamp: t, state: 'paused', frame });
  }, [isLiveMode, isHost, fps, syncPulse]);

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isLiveMode || !isAuthenticated || !playerContainerRef.current) return;
      const rect = playerContainerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const norm = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
      lastCursorRef.current = norm;
      if (cursorThrottleRef.current) return;
      cursorThrottleRef.current = setTimeout(() => {
        cursorThrottleRef.current = null;
        if (lastCursorRef.current) emitCursor(lastCursorRef.current.x, lastCursorRef.current.y);
      }, CURSOR_THROTTLE_MS);
    },
    [isLiveMode, isAuthenticated, emitCursor]
  );

  useEffect(() => {
    return () => {
      if (cursorThrottleRef.current) clearTimeout(cursorThrottleRef.current);
    };
  }, []);

  const [currentTime, setCurrentTime] = useState(0);
  const currentFrame = Math.round(currentTime * fps);
  useEffect(() => {
    const iv = setInterval(() => {
      const player = playerRef.current;
      if (player) {
        const t = player.getCurrentTime();
        setCurrentTime(t);
        const d = player.getDuration();
        if (Number.isFinite(d) && d > 0) setDuration(d);
        const stopAt = pauseAtTimeRef.current;
        if (stopAt != null && t >= stopAt) {
          pauseAtTimeRef.current = null;
          player.pause();
          setIsPlaying(false);
        }
      }
    }, 200);
    return () => clearInterval(iv);
  }, [video?.manifestUrl]);

  const shapeComments = comments.filter((c) => c.type === 'shape' || c.type === 'marker');

  const handleSeekToTimestamp = useCallback(
    (timestamp: number, comment?: { type: string; duration_frames?: number }) => {
      const player = playerRef.current;
      if (!player) return;
      player.seek(timestamp);
      const isMarkerOrShape = comment && (comment.type === 'marker' || comment.type === 'shape');
      const durationFrames = comment?.duration_frames ?? 0;
      if (isMarkerOrShape && durationFrames > 0 && fps > 0) {
        const endTime = timestamp + durationFrames / fps;
        pauseAtTimeRef.current = endTime;
        player.play();
        setIsPlaying(true);
      } else {
        pauseAtTimeRef.current = null;
        player.pause();
        setIsPlaying(false);
      }
    },
    [fps]
  );

  const handleStartMarker = useCallback(() => {
    setMarkerMode({
      segments: [],
      label: '',
      segmentStrokes: [],
    });
  }, []);

  const handleStartDraw = useCallback(() => {
    const player = playerRef.current;
    const t = player?.getCurrentTime() ?? currentTime;
    player?.pause();
    setIsPlaying(false);
    setMarkerMode((m) =>
      m ? { ...m, segmentStartTime: t, segmentStrokes: [] } : m
    );
  }, [currentTime]);

  const handleDoneDrawing = useCallback(() => {
    const player = playerRef.current;
    if (!player || !markerMode || markerMode.segmentStartTime == null) return;
    const endTime = player.getCurrentTime();
    const seg: MarkerSegment = {
      startTime: markerMode.segmentStartTime,
      endTime,
      strokes: [...markerMode.segmentStrokes],
    };
    setMarkerMode((m) =>
      m
        ? {
            ...m,
            segments: [...m.segments, seg],
            segmentStartTime: undefined,
            segmentStrokes: [],
          }
        : m
    );
    player.play();
    setIsPlaying(true);
  }, [markerMode]);

  const handleEndMarker = useCallback(
    async (label: string) => {
      if (!video) return;
      const segments = markerMode?.segments ?? [];
      setMarkerSaving(true);
      try {
        const text = typeof label === 'string' ? label.trim() : '';
        if (segments.length === 0) {
          const t = playerRef.current?.getCurrentTime() ?? 0;
          const res = await videoApi.addComment(
            id,
            {
              type: 'marker',
              timestamp: t,
              duration: 1,
              text,
              drawing_data: undefined,
              ...(token && guestName && { guestName }),
            },
            token
          );
          addComment(res.data);
        } else {
          const minStart = Math.min(...segments.map((s) => s.startTime));
          const maxEnd = Math.max(...segments.map((s) => s.endTime));
          const duration = Math.max(maxEnd - minStart, 0.5);
          const drawingPayload = {
            segments: segments.map((seg) => ({
              startTime: seg.startTime,
              endTime: seg.endTime,
              strokes: seg.strokes,
            })),
          };
          const res = await videoApi.addComment(
            id,
            {
              type: 'marker',
              timestamp: minStart,
              duration,
              text,
              drawing_data: drawingPayload,
              ...(token && guestName && { guestName }),
            },
            token
          );
          addComment(res.data);
        }
        setMarkerMode(null);
      } catch (err) {
        showError(getErrorMessage(err));
      } finally {
        setMarkerSaving(false);
      }
    },
    [id, video, token, guestName, markerMode?.segments, addComment, showError]
  );

  const handleMarkerStroke = useCallback(
    (stroke: { points: Array<{ x: number; y: number }>; color: string; width: number }) => {
      setMarkerMode((m) =>
        m ? { ...m, segmentStrokes: [...m.segmentStrokes, stroke] } : m
      );
    },
    []
  );

  const handleMarkerLabelChange = useCallback((label: string) => {
    setMarkerMode((m) => (m ? { ...m, label } : m));
  }, []);

  const handleControlSeek = useCallback((time: number) => {
    playerRef.current?.seek(time);
  }, []);

  const handleControlPlay = useCallback(() => {
    playerRef.current?.play();
    setIsPlaying(true);
  }, []);

  const handleControlPause = useCallback(() => {
    playerRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const handleSaveDrawing = useCallback(
    async (strokes: Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>) => {
      if (!video || !playerRef.current) return;
      const timestamp = playerRef.current.getCurrentTime();
      try {
        const res = await videoApi.addComment(
          id,
          {
            type: 'shape',
            timestamp,
            drawing_data: strokes,
            duration: 0,
            ...(token && guestName && { guestName }),
          },
          token
        );
        addComment(res.data);
        clearRemoteStrokes();
      } catch (err) {
        showError(getErrorMessage(err));
      }
    },
    [id, video, token, guestName, addComment, clearRemoteStrokes, showError]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading…</div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4 text-white">
        <p>Video not found or you don&apos;t have access.</p>
        <Link href={backHref} className="text-blue-400 hover:underline">
          {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-900/95 px-4 py-2 flex-wrap gap-2">
        <Link href={backHref} className="text-sm text-gray-400 hover:text-white">
          ← {backLabel}
        </Link>
        <h1 className="truncate text-lg font-medium text-white max-w-md">{video.title}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 capitalize">{video.role}</span>
          {isAuthenticated && (
            <>
              {syncState.isLive && isHost && (
                <button
                  type="button"
                  onClick={endSession}
                  className="rounded px-2 py-1 text-xs bg-red-600/80 text-white hover:bg-red-500"
                >
                  End session
                </button>
              )}
              {syncState.isLive && !isHost && syncState.hostName && (
                <span className="text-xs text-gray-400">Live · {syncState.hostName}</span>
              )}
              {!syncState.isLive && (
                <button
                  type="button"
                  onClick={claimHost}
                  className="rounded px-2 py-1 text-xs bg-green-600 text-white hover:bg-green-500"
                >
                  Go live
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto">
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div
            ref={playerContainerRef}
            className="relative w-full aspect-video rounded-lg overflow-hidden bg-black"
            onMouseMove={handleMouseMove}
          >
            {video.manifestUrl ? (
              <HlsPlayer
                ref={playerRef}
                manifestUrl={video.manifestUrl}
                className="rounded-lg"
                showNativeControls={false}
                controlled={
                  isLiveMode && isPassenger
                    ? { syncTime: syncState.syncTime, syncPlaying: syncState.syncPlaying }
                    : undefined
                }
                onTimeUpdate={handleTimeUpdate}
                onPlay={handlePlay}
                onPause={handlePause}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                No playable stream available yet.
              </div>
            )}
            <DrawingCanvas
              iHaveLock={iHaveLock}
              markerModeActive={Boolean(markerMode?.segmentStartTime != null)}
              markerStrokes={markerMode?.segmentStrokes ?? []}
              markerPreviewSegments={markerMode?.segments ?? []}
              strokeColor={strokeColor}
              remoteStrokes={isLiveMode ? remoteStrokes : []}
              shapeComments={shapeComments}
              currentFrame={currentFrame}
              currentTime={currentTime}
              onStroke={emitStroke}
              onMarkerStroke={handleMarkerStroke}
              onSaveDrawing={isLiveMode && canEdit ? handleSaveDrawing : undefined}
            />
            {isLiveMode && <CursorsOverlay cursors={remoteCursors} />}
          </div>
          {video.manifestUrl && (
            <VideoControlBar
              currentTime={currentTime}
              duration={duration}
              fps={fps}
              isPlaying={isPlaying}
              onSeek={handleControlSeek}
              onPlay={handleControlPlay}
              onPause={handleControlPause}
              disabled={isLiveMode && isPassenger}
            />
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {isLiveMode && (
              <>
                <DrawLockBar
                  lockedBy={syncState.lockedBy}
                  currentUserName={user?.name ?? null}
                  isAuthenticated={isAuthenticated}
                  onRequestLock={requestDrawLock}
                  onReleaseLock={releaseDrawLock}
                />
                {iHaveLock && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Pen:</span>
                    <div className="flex gap-1">
                      {PEN_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setStrokeColor(color)}
                          className={`w-6 h-6 rounded-full border-2 hover:border-white focus:outline-none focus:ring-2 focus:ring-white ${
                            strokeColor === color ? 'border-white ring-2 ring-white ring-offset-1 ring-offset-gray-900' : 'border-gray-600'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                          aria-label={`Set pen color to ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {markerMode && canEdit && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Marker pen:</span>
                <div className="flex gap-1">
                  {PEN_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setStrokeColor(color)}
                      className={`w-6 h-6 rounded-full border-2 hover:border-white focus:outline-none focus:ring-2 focus:ring-white ${
                        strokeColor === color ? 'border-white ring-2 ring-white ring-offset-1 ring-offset-gray-900' : 'border-gray-600'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                      aria-label={`Set pen color to ${color}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="w-full lg:w-80 flex-shrink-0 h-[320px] lg:h-[400px]">
          <CommentsPanel
            videoId={id}
            token={token}
            role={video.role}
            comments={comments}
            currentTime={currentTime}
            canEdit={canEdit}
            isGuest={!isAuthenticated}
            guestName={guestName}
            onGuestNameSubmit={handleGuestNameSubmit}
            addComment={addComment}
            removeComment={removeComment}
            onError={showError}
            onSeekToTimestamp={handleSeekToTimestamp}
            markerMode={markerMode}
            onStartMarker={handleStartMarker}
            onStartDraw={handleStartDraw}
            onDoneDrawing={handleDoneDrawing}
            onEndMarker={handleEndMarker}
            onMarkerLabelChange={handleMarkerLabelChange}
            markerSaving={markerSaving}
          />
        </aside>
      </div>
    </div>
  );
}
