export interface RoomStatePayload {
  isLive: boolean;
  hostId: number | null;
  hostName: string | null;
  lockedBy: string | null;
  initialTime: number;
  initialStatus: 'playing' | 'paused';
}

export interface HostRequestedPayload {
  userId: number;
  userName: string;
}

export interface SyncUpdatePayload {
  timestamp?: number;
  frame?: number;
  state?: 'playing' | 'paused';
  driftAllowance?: number;
  force?: boolean;
}

export interface RemoteCursorPayload {
  userId: number;
  name: string;
  color: string;
  x: number;
  y: number;
}

export interface DrawingStrokePayload {
  videoId: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

export interface EphemeralStrokePayload extends DrawingStrokePayload {
  userId?: number;
  userName?: string;
  receivedAt: number;
}
