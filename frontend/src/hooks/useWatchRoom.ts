'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Comment } from '@/types/video';
import type {
  RoomStatePayload,
  SyncUpdatePayload,
  RemoteCursorPayload,
  DrawingStrokePayload,
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
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>;
  addComment: (comment: Comment) => void;
  removeComment: (commentId: string) => void;
  claimHost: () => void;
  endSession: () => void;
  syncPulse: (params: { timestamp: number; state: 'playing' | 'paused'; frame: number }) => void;
  requestDrawLock: () => void;
  releaseDrawLock: () => void;
  emitCursor: (x: number, y: number) => void;
  emitStroke: (data: Omit<DrawingStrokePayload, 'videoId'>) => void;
  clearRemoteStrokes: () => void;
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
  const cursorTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const joinedRef = useRef(false);

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
        hostId: payload.hostId,
        hostName: payload.hostName,
      }));
    };

    const handleSessionEnded = () => {
      setSyncState((s) => ({
        ...s,
        isLive: false,
        hostId: null,
        hostName: null,
      }));
    };

    const handleLockUpdate = (payload: { lockedBy: string | null }) => {
      setSyncState((s) => ({ ...s, lockedBy: payload.lockedBy }));
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

    const handleErrorMsg = (message: string) => {
      onError?.(message);
    };

    socket.on('room_state', handleRoomState);
    socket.on('sync_update', handleSyncUpdate);
    socket.on('host_changed', handleHostChanged);
    socket.on('session_ended', handleSessionEnded);
    socket.on('lock_update', handleLockUpdate);
    socket.on('new_comment', handleNewComment);
    socket.on('delete_comment', handleDeleteComment);
    socket.on('remote_cursor', handleRemoteCursor);
    socket.on('remote_stroke', handleRemoteStroke);
    socket.on('error_msg', handleErrorMsg);

    return () => {
      socket.off('room_state', handleRoomState);
      socket.off('sync_update', handleSyncUpdate);
      socket.off('host_changed', handleHostChanged);
      socket.off('session_ended', handleSessionEnded);
      socket.off('lock_update', handleLockUpdate);
      socket.off('new_comment', handleNewComment);
      socket.off('delete_comment', handleDeleteComment);
      socket.off('remote_cursor', handleRemoteCursor);
      socket.off('remote_stroke', handleRemoteStroke);
      socket.off('error_msg', handleErrorMsg);
      cursorTimeoutsRef.current.forEach((t) => clearTimeout(t));
      cursorTimeoutsRef.current.clear();
    };
  }, [socket, videoId, addComment, removeComment, onError]);

  const claimHost = useCallback(() => {
    if (socket && videoId) socket.emit('claim_host', videoId);
  }, [socket, videoId]);

  const endSession = useCallback(() => {
    if (socket && videoId) socket.emit('end_session', videoId);
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

  return {
    syncState,
    comments,
    remoteCursors,
    remoteStrokes,
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
    clearRemoteStrokes,
  };
}
