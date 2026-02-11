/** Payload from server on join_room */
export interface RoomStatePayload {
  isLive: boolean;
  hostId: number | null;
  hostName: string | null;
  lockedBy: string | null;
  initialTime: number;
  initialStatus: 'playing' | 'paused';
}

/** Sync update from host (passengers receive this) */
export interface SyncUpdatePayload {
  timestamp?: number;
  frame?: number;
  state?: 'playing' | 'paused';
  driftAllowance?: number;
  force?: boolean;
}

/** Remote cursor from another user */
export interface RemoteCursorPayload {
  userId: number;
  name: string;
  color: string;
  x: number;
  y: number;
}

/** Drawing stroke (emit or receive) */
export interface DrawingStrokePayload {
  videoId: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}
