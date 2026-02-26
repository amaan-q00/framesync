'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import AppLogo from '@/components/ui/AppLogo';
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
import { ActivityBar } from '@/components/watch/ActivityBar';
import { ArrowLeft, Radio, Square, UserMinus, UserPlus, UserCheck, LogOut } from 'lucide-react';

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
  const router = useRouter();
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
    isPublicAccess?: boolean;
    status?: string;
  } | null>(null);
  const [guestIsHost, setGuestIsHost] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [guestName, setGuestName] = useState('');
  const [strokeColor, setStrokeColor] = useState('#FF0000');
  const [markerMode, setMarkerMode] = useState<MarkerModeState | null>(null);
  const [markerSaving, setMarkerSaving] = useState(false);
  /** Popup: timestamp captured when Quick marker was clicked; submit uses this time, not submit time. */
  const [quickMarkerPopup, setQuickMarkerPopup] = useState<{ timestamp: number } | null>(null);
  /** Popup: segments captured when End marker was clicked; submit uses these, not submit time. */
  const [endMarkerPopup, setEndMarkerPopup] = useState<{ segments: MarkerSegment[] } | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [manifestLoadFailed, setManifestLoadFailed] = useState(false);
  const [manifestRetryKey, setManifestRetryKey] = useState(0);
  const playerRef = useRef<HlsPlayerControlRef | null>(null);
  const lastSyncPulseRef = useRef(0);
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);
  const pauseAtTimeRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const markerModeRef = useRef<MarkerModeState | null>(null);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    markerModeRef.current = markerMode;
  }, [markerMode]);

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
    requestBecomeHost,
    releaseHost,
    syncPulse,
    requestDrawLock,
    releaseDrawLock,
    emitCursor,
    emitStroke,
    emitEphemeralStroke,
    remoteCursors,
    remoteStrokes,
    ephemeralStrokes,
    clearRemoteStrokes,
    activityEntries,
  } = useWatchRoom(socket, id, fps, {
    userId: user ? Number(user.id) : undefined,
    onError: showError,
  });

  const isLiveMode = syncState.isLive;
  const isHost =
    (isAuthenticated && syncState.hostId !== null && user && Number(user.id) === syncState.hostId) || guestIsHost;
  const [userHasJoinedLive, setUserHasJoinedLive] = useState(false);
  const isPassenger = isLiveMode && userHasJoinedLive && syncState.hasRoomState && !isHost;
  /** In live session and either host or joined as viewer (so they can draw/see ephemeral, cursors, etc.) */
  const isInLiveSession = isLiveMode && (isHost || userHasJoinedLive);

  useEffect(() => {
    if (!syncState.isLive) setUserHasJoinedLive(false);
  }, [syncState.isLive]);

  useEffect(() => {
    if (!syncState.isLive) setGuestIsHost(false);
  }, [syncState.isLive]);

  useEffect(() => {
    if (!socket) return;
    const onYouAreHost = () => setGuestIsHost(true);
    socket.on('you_are_host', onYouAreHost);
    return () => {
      socket.off('you_are_host', onYouAreHost);
    };
  }, [socket]);

  const isHostRef = useRef(false);
  const isLiveModeRef = useRef(false);
  isHostRef.current = Boolean(isHost);
  isLiveModeRef.current = Boolean(isLiveMode);
  const canEdit = video?.role === 'owner' || video?.role === 'editor';
  const isPlayable = Boolean(video?.manifestUrl);
  const canAddComment = Boolean(video && isPlayable);
  const canAddMarkers = (video?.role === 'owner' || video?.role === 'editor') && (!isLiveMode || isHost) && isPlayable;
  /** Ephemeral drawing: only in live session (broadcast, 1s TTL, never saved). Not available in solo. */
  const canDoEphemeral = isInLiveSession && !video?.isPublicAccess;
  const iHaveLock = Boolean(
    isLiveMode &&
      isAuthenticated &&
      syncState.lockedBy !== null &&
      user &&
      syncState.lockedBy === user.name
  );

  const backHref = isAuthenticated ? '/dashboard' : '/login';
  const backLabel = isAuthenticated ? 'Dashboard' : 'Sign in';

  const onManifestFatalError = useCallback(() => setManifestLoadFailed(true), []);
  const onManifestParsed = useCallback(() => setManifestLoadFailed(false), []);

  useEffect(() => {
    setManifestLoadFailed(false);
    setManifestRetryKey(0);
  }, [id, video?.manifestUrl]);

  useEffect(() => {
    if (!manifestLoadFailed || !video?.manifestUrl) return;
    const interval = setInterval(() => {
      setManifestRetryKey((k) => k + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, [manifestLoadFailed, video?.manifestUrl]);

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
            isPublicAccess: Boolean(res.data.isPublicAccess),
            status: res.data.status,
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

  // Poll getVideo when we have no manifestUrl yet (uploading, queued, or processing with 0 segments)
  // so we get manifestUrl once the first chunk exists or video is ready
  useEffect(() => {
    if (!id || !video || video.manifestUrl) return;
    const status = video.status;
    if (status !== 'uploading' && status !== 'queued' && status !== 'processing') return;
    const interval = setInterval(() => {
      videoApi.getVideo(id, token).then((res) => {
        setVideo((prev) =>
          prev
            ? {
                ...prev,
                manifestUrl: res.data.manifestUrl,
                status: res.data.status,
              }
            : prev
        );
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [id, token, video?.status, video?.manifestUrl]);

  // When permission changes (access revoked or role changed), push user to dashboard
  const videoRoleRef = useRef<string | null>(null);
  if (video?.role) videoRoleRef.current = video.role;

  const checkPermissionAndRedirect = useCallback(() => {
    if (!id) return;
    videoApi
      .getVideo(id, token)
      .then((res) => {
        const newRole = res.data.role as string;
        const prevRole = videoRoleRef.current;
        videoRoleRef.current = newRole;
        if (prevRole != null && newRole !== prevRole) {
          router.replace('/dashboard');
        }
      })
      .catch((err: unknown) => {
        const status = err && typeof err === 'object' && 'status' in err ? (err as { status?: number }).status : undefined;
        if (status === 403) {
          router.replace('/dashboard');
        }
      });
  }, [id, token, router]);

  useEffect(() => {
    if (!id) return;
    const POLL_MS = 20000;
    const immediate = setTimeout(() => checkPermissionAndRedirect(), 3000);
    const interval = setInterval(checkPermissionAndRedirect, POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkPermissionAndRedirect();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [id, checkPermissionAndRedirect]);

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

  // End live session when host leaves the watch page (e.g. back to dashboard)
  useEffect(() => {
    return () => {
      if (socket && id && isHostRef.current && isLiveModeRef.current) {
        socket.emit('end_session', id);
      }
    };
  }, [socket, id]);

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
      const state = isPlayingRef.current ? 'playing' : 'paused';
      syncPulse({ timestamp: time, state, frame });
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
      if (!isInLiveSession || !canDoEphemeral || !playerContainerRef.current) return;
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
    [isInLiveSession, canDoEphemeral, emitCursor]
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

  /** Capture time when Quick marker is clicked; parent shows popup. Time used on submit is this, not submit time. */
  const handleRequestQuickMarker = useCallback(() => {
    const t = playerRef.current?.getCurrentTime() ?? 0;
    setQuickMarkerPopup({ timestamp: t });
  }, []);

  const handleQuickMarkerSubmit = useCallback(
    async (label: string) => {
      if (!video || quickMarkerPopup == null) return;
      const t = quickMarkerPopup.timestamp;
      setMarkerSaving(true);
      try {
        const res = await videoApi.addComment(
          id,
          {
            type: 'marker',
            timestamp: t,
            duration: 1,
            text: typeof label === 'string' ? label.trim() : '',
            drawing_data: undefined,
            ...(token && guestName && { guestName }),
          },
          token
        );
        addComment(res.data);
        setQuickMarkerPopup(null);
      } catch (err) {
        showError(getErrorMessage(err));
      } finally {
        setMarkerSaving(false);
      }
    },
    [id, video, token, guestName, quickMarkerPopup, addComment, showError]
  );

  const handleQuickMarkerCancel = useCallback(() => {
    setQuickMarkerPopup(null);
  }, []);

  /** Marker with drawing: one click = pause + start time. User can add segments (Draw / Done drawing), then End marker opens popup. */
  const handleStartMarkerWithDrawing = useCallback(() => {
    const player = playerRef.current;
    const t = player?.getCurrentTime() ?? currentTime;
    player?.pause();
    setIsPlaying(false);
    const mode: MarkerModeState = {
      segments: [],
      label: '',
      segmentStrokes: [],
      segmentStartTime: t,
    };
    markerModeRef.current = mode;
    setMarkerMode(mode);
  }, [currentTime]);

  /** Add another segment: pause at current time, user draws, then Done drawing. */
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
    const latest = markerModeRef.current;
    if (!player || !latest || latest.segmentStartTime == null) return;
    const endTime = player.getCurrentTime();
    const seg: MarkerSegment = {
      startTime: latest.segmentStartTime,
      endTime,
      strokes: [...latest.segmentStrokes],
    };
    const nextMode: MarkerModeState = {
      ...latest,
      segments: [...latest.segments, seg],
      segmentStartTime: undefined,
      segmentStrokes: [],
    };
    markerModeRef.current = nextMode;
    setMarkerMode((m) => (m ? nextMode : m));
    player.play();
    setIsPlaying(true);
  }, []);

  const handleCancelDrawing = useCallback(() => {
    markerModeRef.current = null;
    setMarkerMode(null);
    playerRef.current?.play();
    setIsPlaying(true);
  }, []);

  /** Capture segments when End marker is clicked; open popup. On submit we use these segments (times from button clicks). */
  const handleRequestEndMarker = useCallback(() => {
    const latest = markerModeRef.current;
    let segments = latest?.segments ?? [];
    const segmentStartTime = latest?.segmentStartTime;
    const segmentStrokes = latest?.segmentStrokes ?? [];
    const now = playerRef.current?.getCurrentTime() ?? 0;
    if (segments.length === 0 && segmentStartTime != null) {
      segments = [
        {
          startTime: segmentStartTime,
          endTime: now,
          strokes: [...segmentStrokes],
        },
      ];
    }
    markerModeRef.current = null;
    setMarkerMode(null);
    playerRef.current?.play();
    setIsPlaying(true);
    setEndMarkerPopup({ segments });
  }, []);

  const handleEndMarkerSubmit = useCallback(
    async (label: string) => {
      if (!video || endMarkerPopup == null) return;
      const segments = endMarkerPopup.segments;
      setMarkerSaving(true);
      try {
        const text = typeof label === 'string' ? label.trim() : '';
        if (segments.length === 0) {
          const res = await videoApi.addComment(
            id,
            {
              type: 'marker',
              timestamp: 0,
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
          const duration = Math.max(maxEnd - minStart, 1);
          const res = await videoApi.addComment(
            id,
            {
              type: 'marker',
              timestamp: minStart,
              duration,
              text,
              drawing_data: {
                segments: segments.map((seg) => ({
                  startTime: seg.startTime,
                  endTime: seg.endTime,
                  strokes: seg.strokes,
                })),
              },
              ...(token && guestName && { guestName }),
            },
            token
          );
          addComment(res.data);
        }
        setEndMarkerPopup(null);
      } catch (err) {
        showError(getErrorMessage(err));
      } finally {
        setMarkerSaving(false);
      }
    },
    [id, video, token, guestName, endMarkerPopup, addComment, showError]
  );

  const handleEndMarkerCancel = useCallback(() => {
    setEndMarkerPopup(null);
  }, []);

  const handleStroke = useCallback(
    (stroke: { points: Array<{ x: number; y: number }>; color: string; width: number }) => {
      if (isLiveMode && !iHaveLock && canDoEphemeral) {
        emitEphemeralStroke(stroke);
      } else {
        emitStroke(stroke);
      }
    },
    [isLiveMode, iHaveLock, canDoEphemeral, emitEphemeralStroke, emitStroke]
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

  const handleControlSeek = useCallback(
    (time: number) => {
      playerRef.current?.seek(time);
      if (isLiveMode && isHost && playerRef.current) {
        const frame = Math.round(time * fps);
        const state = isPlayingRef.current ? 'playing' : 'paused';
        syncPulse({ timestamp: time, state, frame });
      }
    },
    [isLiveMode, isHost, fps, syncPulse]
  );

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
            duration: 1,
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
      <div className="min-h-screen bg-page flex items-center justify-center animate-fade-in">
        <div className="text-fg">Loading…</div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-page flex flex-col items-center justify-center gap-4 text-fg px-4 animate-fade-in">
        <p>Video not found or you don&apos;t have access.</p>
        <Link href={backHref} className="text-primary hover:opacity-90 transition-opacity">
          {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page">
      <div className="sticky top-0 z-10 border-b border-border bg-elevated/95 backdrop-blur-sm px-4 py-2 sm:py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            <Link
              href={backHref}
              className="flex items-center gap-1.5 rounded-md py-2 pr-2 -ml-1 text-fg-muted hover:text-accent hover:bg-elevated transition-colors duration-150 shrink-0"
              aria-label={`Back to ${backLabel}`}
            >
              <ArrowLeft size={20} strokeWidth={2} aria-hidden />
              <span className="text-sm font-medium hidden sm:inline whitespace-nowrap">{backLabel}</span>
            </Link>
            <span className="h-5 w-px bg-border shrink-0" aria-hidden />
            <AppLogo href={isAuthenticated ? '/dashboard' : '/'} iconSize={26} className="shrink-0" />
            <span className="h-5 w-px bg-border shrink-0 hidden sm:inline" aria-hidden />
            <h1 className="truncate text-base sm:text-lg font-semibold text-fg min-w-0" title={video.title}>
              {video.title}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0 sm:shrink-0">
            <span className="text-xs text-fg-muted capitalize shrink-0">{video.role}</span>
          {(isAuthenticated || video?.isPublicAccess) && (
            <>
              {syncState.isLive && isHost && (
                <div className="flex items-center gap-2 flex-wrap">
                  {syncState.pendingHostRequest ? (
                    <button
                      type="button"
                      onClick={releaseHost}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs bg-primary text-white hover:opacity-90 transition-opacity"
                    >
                      <UserCheck size={14} aria-hidden />
                      Hand over to {syncState.pendingHostRequest.userName}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={releaseHost}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs bg-surface border border-border text-fg hover:bg-elevated transition-colors duration-150"
                    >
                      <UserMinus size={14} aria-hidden />
                      Release host
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={endSession}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs bg-danger text-white hover:opacity-90 transition-opacity"
                  >
                    <Square size={14} aria-hidden />
                    End session
                  </button>
                </div>
              )}
              {syncState.isLive && !isHost && syncState.hostName && !userHasJoinedLive && (
                <button
                  type="button"
                  onClick={() => setUserHasJoinedLive(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs bg-success text-white hover:opacity-90 transition-opacity"
                >
                  <Radio size={14} aria-hidden />
                  Join live · {syncState.hostName}
                </button>
              )}
              {syncState.isLive && !isHost && syncState.hostName && userHasJoinedLive && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-fg-muted">Watching live · {syncState.hostName}</span>
                  <button
                    type="button"
                    onClick={() => setUserHasJoinedLive(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs bg-surface border border-border text-fg hover:bg-elevated transition-colors duration-150"
                  >
                    <LogOut size={14} aria-hidden />
                    Leave live
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={requestBecomeHost}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs bg-primary text-white hover:opacity-90 transition-opacity"
                    >
                      <UserPlus size={14} aria-hidden />
                      Request host
                    </button>
                  )}
                </div>
              )}
              {!syncState.isLive && canEdit && (
                <button
                  type="button"
                  onClick={claimHost}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs bg-success text-white hover:opacity-90 transition-opacity"
                >
                  <Radio size={14} aria-hidden />
                  Go live
                </button>
              )}
              {!syncState.isLive && !canEdit && (
                <span className="text-xs text-fg-muted">Only editors can go live</span>
              )}
            </>
          )}
        </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {isInLiveSession && <ActivityBar entries={activityEntries} className="shrink-0" />}
          <div
            ref={playerContainerRef}
            className="relative w-full aspect-video rounded-lg overflow-hidden bg-black"
            onMouseMove={handleMouseMove}
          >
            {video.manifestUrl ? (
              <>
                <HlsPlayer
                  key={manifestRetryKey}
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
                  onFatalError={onManifestFatalError}
                  onManifestParsed={onManifestParsed}
                />
                {manifestLoadFailed && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg z-10">
                    <p className="text-fg text-sm px-4 text-center">
                      Processing… stream will appear shortly.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-fg-muted">
                No playable stream available yet.
              </div>
            )}
            <DrawingCanvas
              iHaveLock={iHaveLock}
              markerModeActive={Boolean(markerMode?.segmentStartTime != null)}
              markerStrokes={markerMode?.segmentStrokes ?? []}
              markerPreviewSegments={markerMode?.segments ?? []}
              strokeColor={strokeColor}
              remoteStrokes={canDoEphemeral ? remoteStrokes : []}
              ephemeralStrokes={
                canDoEphemeral ? ephemeralStrokes.map((s) => ({ points: s.points, color: s.color, width: s.width })) : []
              }
              canDrawEphemeral={canDoEphemeral}
              isEphemeralStroke={canDoEphemeral && (isLiveMode ? !iHaveLock : true)}
              shapeComments={shapeComments}
              currentFrame={currentFrame}
              currentTime={currentTime}
              fps={fps}
              onStroke={handleStroke}
              onMarkerStroke={handleMarkerStroke}
              onSaveDrawing={isLiveMode && canEdit ? handleSaveDrawing : undefined}
            />
            {canDoEphemeral && <CursorsOverlay cursors={remoteCursors} />}
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
          <div className="flex items-center gap-4 overflow-hidden min-h-[52px]">
            {canDoEphemeral && !markerMode && (
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <span className="text-xs text-fg-muted shrink-0">Pen:</span>
                <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden py-1">
                  {PEN_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setStrokeColor(color)}
                      className={`shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center hover:border-fg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-page transition-shadow ${
                        strokeColor === color ? 'border-fg ring-2 ring-primary ring-offset-2 ring-offset-page' : 'border-border'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                      aria-label={`Set pen color to ${color}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {markerMode && canEdit && (
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <span className="text-xs text-fg-muted shrink-0">Marker pen:</span>
                <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden py-1">
                  {PEN_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setStrokeColor(color)}
                      className={`shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center hover:border-fg focus:outline-none focus:ring-2 focus:ring-primary ${
                        strokeColor === color ? 'border-fg ring-2 ring-primary ring-offset-2 ring-offset-page' : 'border-border'
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

        <aside className="w-full lg:w-80 flex-shrink-0 h-[320px] lg:h-[400px] min-h-0">
          <CommentsPanel
            videoId={id}
            token={token}
            role={video.role}
            comments={comments}
            currentTime={currentTime}
            canAddComment={canAddComment}
            canDeleteAny={video.role === 'owner'}
            canDeleteOwn={true}
            currentUserId={user ? Number(user.id) : undefined}
            isGuest={!isAuthenticated}
            guestName={guestName}
            onGuestNameSubmit={handleGuestNameSubmit}
            addComment={addComment}
            removeComment={removeComment}
            onError={showError}
            onSeekToTimestamp={isLiveMode && isPassenger ? undefined : handleSeekToTimestamp}
            markerMode={markerMode}
            quickMarkerPopup={quickMarkerPopup}
            endMarkerPopup={endMarkerPopup}
            onRequestQuickMarker={handleRequestQuickMarker}
            onQuickMarkerSubmit={handleQuickMarkerSubmit}
            onQuickMarkerCancel={handleQuickMarkerCancel}
            onStartMarkerWithDrawing={handleStartMarkerWithDrawing}
            onStartDraw={handleStartDraw}
            onDoneDrawing={handleDoneDrawing}
            onCancelDrawing={handleCancelDrawing}
            onRequestEndMarker={handleRequestEndMarker}
            onEndMarkerSubmit={handleEndMarkerSubmit}
            onEndMarkerCancel={handleEndMarkerCancel}
            markerSaving={markerSaving}
            canAddMarkersInLive={canAddMarkers}
          />
        </aside>
      </div>
    </div>
  );
}
