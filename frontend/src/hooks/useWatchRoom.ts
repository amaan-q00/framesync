'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Comment } from '@/types/video';
import type {
  RoomStatePayload,
  SyncUpdatePayload,
  RemoteCursorPayload,
  DrawingStrokePayload,
  EphemeralStrokePayload,
} from '@/types/watch';

export interface WatchRoomSyncState {
  /** Latest sync timestamp (seconds) from host */
  syncTime: number;
  /** Latest play/pause from host */
  syncPlaying: boolean;
  /** From room_state: time for late joiners */
  initialTime: number;
  /** From room_state: status for late joiners */
  initialStatus: 'playing' | 'paused';
  /** Whether we have received room_state at least once (so player can apply initial) */
  hasRoomState: boolean;
  isLive: boolean;
  hostId: number | null;
  hostName: string | null;
  lockedBy: string | null;
  /** Set when someone requested to become host; only host should show "Hand over" */
  pendingHostRequest: { userId: number; userName: string } | null;
}

export interface UseWatchRoomOptions {
  userId?: number;
  onError?: (message: string) => void;
}

export interface UseWatchRoomResult {
  syncState: WatchRoomSyncState;
  comments: Comment[];
  remoteCursors: Map<number, RemoteCursorPayload>;
  remoteStrokes: DrawingStrokePayload[];
  ephemeralStrokes: EphemeralStrokePayload[];
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>;
  addComment: (comment: Comment) => void;
  removeComment: (commentId: string) => void;
  claimHost: () => void;
  endSession: () => void;
  requestBecomeHost: () => void;
  releaseHost: () => void;
  syncPulse: (params: { timestamp: number; state: 'playing' | 'paused'; frame: number }) => void;
  requestDrawLock: () => void;
  releaseDrawLock: () => void;
  emitCursor: (x: number, y: number) => void;
  emitStroke: (data: Omit<DrawingStrokePayload, 'videoId'>) => void;
  emitEphemeralStroke: (data: Omit<DrawingStrokePayload, 'videoId'>) => void;
  clearRemoteStrokes: () => void;
  activityEntries: Array<{ id: string; message: string; timestamp: number }>;
}

const DEFAULT_SYNC_STATE: WatchRoomSyncState = {
  syncTime: 0,
  syncPlaying: false,
  initialTime: 0,
  initialStatus: 'paused',
  hasRoomState: false,
  isLive: false,
  hostId: null,
  hostName: null,
  lockedBy: null,
  pendingHostRequest: null,
};

const CURSOR_TIMEOUT_MS = 2000;

export function useWatchRoom(
  socket: Socket | null,
  videoId: string,
  fps: number,
  options: UseWatchRoomOptions = {}
): UseWatchRoomResult {
  const { userId, onError } = options;
  const [syncState, setSyncState] = useState<WatchRoomSyncState>(DEFAULT_SYNC_STATE);
  const [comments, setComments] = useState<Comment[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Map<number, RemoteCursorPayload>>(new Map());
  const [remoteStrokes, setRemoteStrokes] = useState<DrawingStrokePayload[]>([]);
  const [ephemeralStrokes, setEphemeralStrokes] = useState<EphemeralStrokePayload[]>([]);
  const [activityEntries, setActivityEntries] = useState<Array<{ id: string; message: string; timestamp: number }>>([]);
  const cursorTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const joinedRef = useRef(false);

  const EPHEMERAL_TTL_MS = 1000;
  const ACTIVITY_MAX = 20;

  const pushActivity = useCallback((message: string) => {
    setActivityEntries((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message, timestamp: Date.now() }];
      return next.slice(-ACTIVITY_MAX);
    });
  }, []);
  const EPHEMERAL_PRUNE_INTERVAL_MS = 500;

  const addComment = useCallback((comment: Comment) => {
    setComments((prev) => {
      if (prev.some((c) => c.id === comment.id)) return prev;
      return [...prev, comment].sort((a, b) => a.frame_number - b.frame_number);
    });
  }, []);

  const removeComment = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);

  const clearRemoteStrokes = useCallback(() => {
    setRemoteStrokes([]);
  }, []);

  // Join room when socket and videoId are ready
  useEffect(() => {
    if (!socket || !videoId) return;
    socket.emit('join_room', videoId);
    joinedRef.current = true;
    setSyncState((s) => ({ ...s, hasRoomState: false }));

    return () => {
      joinedRef.current = false;
    };
  }, [socket, videoId]);

  // Socket listeners
  useEffect(() => {
    if (!socket || !videoId) return;

    const handleRoomState = (payload: RoomStatePayload) => {
      setSyncState((s) => ({
        ...s,
        hasRoomState: true,
        initialTime: payload.initialTime,
        initialStatus: payload.initialStatus,
        syncTime: payload.initialTime,
        syncPlaying: payload.initialStatus === 'playing',
        isLive: payload.isLive,
        hostId: payload.hostId,
        hostName: payload.hostName,
        lockedBy: payload.lockedBy,
      }));
    };

    const handleSyncUpdate = (payload: SyncUpdatePayload) => {
      setSyncState((s) => {
        const next = { ...s };
        if (payload.timestamp != null) next.syncTime = payload.timestamp;
        if (payload.state != null) next.syncPlaying = payload.state === 'playing';
        return next;
      });
    };

    const handleHostChanged = (payload: { hostId: number | null; hostName: string | null }) => {
      setSyncState((s) => ({
        ...s,
        isLive: payload.hostId != null,
        hostId: payload.hostId,
        hostName: payload.hostName,
        pendingHostRequest: null,
      }));
      if (payload.hostName) {
        pushActivity(`${payload.hostName} is now host`);
      }
    };

    const handleHostRequested = (payload: { userId: number; userName: string }) => {
      setSyncState((s) => ({
        ...s,
        pendingHostRequest: { userId: payload.userId, userName: payload.userName },
      }));
      pushActivity(`${payload.userName} requested to become host`);
    };

    const handleSessionEnded = () => {
      setSyncState((s) => ({
        ...s,
        isLive: false,
        hostId: null,
        hostName: null,
        pendingHostRequest: null,
      }));
    };

    const handleLockUpdate = (payload: { lockedBy: string | null }) => {
      setSyncState((s) => ({ ...s, lockedBy: payload.lockedBy }));
      if (payload.lockedBy) {
        pushActivity(`Host (${payload.lockedBy}) is annotating`);
      } else {
        pushActivity('Stopped annotating');
      }
    };

    const handleNewComment = (payload: Comment & { user_name?: string }) => {
      const comment: Comment = {
        ...payload,
        user_name: payload.user_name ?? payload.guest_name ?? 'Guest',
      };
      addComment(comment);
    };

    const handleDeleteComment = (payload: { commentId: string }) => {
      removeComment(payload.commentId);
    };

    const handleRemoteCursor = (payload: RemoteCursorPayload) => {
      const id = payload.userId;
      cursorTimeoutsRef.current.get(id) && clearTimeout(cursorTimeoutsRef.current.get(id)!);
      cursorTimeoutsRef.current.set(
        id,
        setTimeout(() => {
          setRemoteCursors((m) => {
            const next = new Map(m);
            next.delete(id);
            return next;
          });
          cursorTimeoutsRef.current.delete(id);
        }, CURSOR_TIMEOUT_MS)
      );
      setRemoteCursors((m) => new Map(m).set(id, payload));
    };

    const handleRemoteStroke = (data: DrawingStrokePayload) => {
      if (data.videoId !== videoId) return;
      setRemoteStrokes((prev) => [...prev, data]);
    };

    const handleRemoteLiveAnnotation = (data: DrawingStrokePayload & { userId?: number; userName?: string }) => {
      if (data.videoId !== videoId) return;
      setEphemeralStrokes((prev) => [
        ...prev,
        { ...data, receivedAt: Date.now() },
      ]);
    };

    const handleErrorMsg = (message: string) => {
      onError?.(message);
    };

    socket.on('room_state', handleRoomState);
    socket.on('sync_update', handleSyncUpdate);
    socket.on('host_changed', handleHostChanged);
    socket.on('host_requested', handleHostRequested);
    socket.on('session_ended', handleSessionEnded);
    socket.on('lock_update', handleLockUpdate);
    socket.on('new_comment', handleNewComment);
    socket.on('delete_comment', handleDeleteComment);
    socket.on('remote_cursor', handleRemoteCursor);
    socket.on('remote_stroke', handleRemoteStroke);
    socket.on('remote_live_annotation', handleRemoteLiveAnnotation);
    socket.on('error_msg', handleErrorMsg);

    return () => {
      socket.off('room_state', handleRoomState);
      socket.off('sync_update', handleSyncUpdate);
      socket.off('host_changed', handleHostChanged);
      socket.off('host_requested', handleHostRequested);
      socket.off('session_ended', handleSessionEnded);
      socket.off('lock_update', handleLockUpdate);
      socket.off('new_comment', handleNewComment);
      socket.off('delete_comment', handleDeleteComment);
      socket.off('remote_cursor', handleRemoteCursor);
      socket.off('remote_stroke', handleRemoteStroke);
      socket.off('remote_live_annotation', handleRemoteLiveAnnotation);
      socket.off('error_msg', handleErrorMsg);
      cursorTimeoutsRef.current.forEach((t) => clearTimeout(t));
      cursorTimeoutsRef.current.clear();
    };
  }, [socket, videoId, addComment, removeComment, onError, pushActivity]);

  // Prune ephemeral strokes older than TTL
  useEffect(() => {
    if (!socket || !videoId) return;
    const iv = setInterval(() => {
      const now = Date.now();
      setEphemeralStrokes((prev) => prev.filter((s) => now - s.receivedAt < EPHEMERAL_TTL_MS));
    }, EPHEMERAL_PRUNE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [socket, videoId]);

  const claimHost = useCallback(() => {
    if (socket && videoId) socket.emit('claim_host', videoId);
  }, [socket, videoId]);

  const endSession = useCallback(() => {
    if (socket && videoId) socket.emit('end_session', videoId);
  }, [socket, videoId]);

  const requestBecomeHost = useCallback(() => {
    if (socket && videoId) socket.emit('request_become_host', videoId);
  }, [socket, videoId]);

  const releaseHost = useCallback(() => {
    if (socket && videoId) socket.emit('release_host', videoId);
  }, [socket, videoId]);

  const syncPulse = useCallback(
    (params: { timestamp: number; state: 'playing' | 'paused'; frame: number }) => {
      if (socket && videoId) socket.emit('sync_pulse', { videoId, ...params });
    },
    [socket, videoId]
  );

  const requestDrawLock = useCallback(() => {
    if (socket && videoId) socket.emit('request_draw_lock', videoId);
  }, [socket, videoId]);

  const releaseDrawLock = useCallback(() => {
    if (socket && videoId) socket.emit('release_draw_lock', videoId);
  }, [socket, videoId]);

  const emitCursor = useCallback(
    (x: number, y: number) => {
      if (socket && videoId) socket.emit('cursor_move', { videoId, x, y });
    },
    [socket, videoId]
  );

  const emitStroke = useCallback(
    (data: Omit<DrawingStrokePayload, 'videoId'>) => {
      if (socket && videoId) socket.emit('drawing_stroke', { ...data, videoId });
    },
    [socket, videoId]
  );

  const emitEphemeralStroke = useCallback(
    (data: Omit<DrawingStrokePayload, 'videoId'>) => {
      if (socket && videoId) socket.emit('live_annotation_stroke', { ...data, videoId });
    },
    [socket, videoId]
  );

  return {
    syncState,
    comments,
    remoteCursors,
    remoteStrokes,
    ephemeralStrokes,
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
    clearRemoteStrokes,
    activityEntries,
  };
}
