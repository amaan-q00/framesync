import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../utils/jwt';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { User } from '../types';
import pool from '../config/db';

export interface GuestAccess {
  videoId: string;
  publicToken?: string;
  isEditor?: boolean;
}

const GUEST_HOST_ID = -1;

interface RoomState {
  hostId: number | null;
  hostName: string | null;
  isLive: boolean;
  lastTimestamp: number;
  lastStatus: 'playing' | 'paused';
  lastHeartbeatAt: number;
  markerLock: { userId: number; username: string; expiresAt: number } | null;
  pendingHostRequest: { userId: number; userName: string } | null;
}

const DEFAULT_ROOM_STATE: RoomState = {
  hostId: null,
  hostName: null,
  isLive: false,
  lastTimestamp: 0,
  lastStatus: 'paused',
  lastHeartbeatAt: Date.now(),
  markerLock: null,
  pendingHostRequest: null,
};

export class SocketService {
  private io: Server;
  private static instance: SocketService;
  private readonly ROOM_PREFIX = 'room:state:';
  private readonly LOCK_DURATION_MS = 30000;
  private hostSocketToVideoId = new Map<string, string>();

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: env.APP_URL,
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    
    SocketService.instance = this;
    this.initialize();
  }

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      throw new Error("SocketService not initialized. Call constructor with HttpServer first.");
    }
    return SocketService.instance;
  }

  public getIO(): Server {
    return this.io;
  }

  private async getRoomState(videoId: string): Promise<RoomState> {
    const raw = await redis.get(`${this.ROOM_PREFIX}${videoId}`);
    if (!raw) return { ...DEFAULT_ROOM_STATE };
    return { ...DEFAULT_ROOM_STATE, ...JSON.parse(raw) };
  }

  private async saveRoomState(videoId: string, state: RoomState): Promise<void> {
    await redis.setex(`${this.ROOM_PREFIX}${videoId}`, 86400, JSON.stringify(state));
  }

  private async isEditorForVideo(videoId: string, userId: number): Promise<boolean> {
    const videoRes = await pool.query(
      "SELECT user_id FROM videos WHERE id = $1",
      [videoId]
    );
    if (videoRes.rowCount === 0) return false;
    if (videoRes.rows[0].user_id === userId) return true;
    const shareRes = await pool.query(
      "SELECT role FROM video_shares WHERE video_id = $1 AND user_id = $2",
      [videoId, userId]
    );
    return (shareRes.rowCount ?? 0) > 0 && shareRes.rows[0].role === "editor";
  }

  private initialize() {
    this.io.use(async (socket, next) => {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers?.token as string | undefined);

      if (token) {
        const isBlacklisted = await redis.get(`blacklist:${token}`);
        if (isBlacklisted) {
          return next(new Error("Token revoked"));
        }
        try {
          const user = await verifyToken(token);
          socket.data.user = user;
          socket.data.guestAccess = undefined;
          return next();
        } catch { }
      }

      const publicToken = socket.handshake.auth?.publicToken as string | undefined;
      const videoId = socket.handshake.auth?.videoId as string | undefined;
      if (publicToken && videoId) {
        try {
          const row = await pool.query(
            'SELECT id, public_role FROM videos WHERE id = $1 AND is_public = true AND public_token = $2',
            [videoId, publicToken]
          );
          if (row.rowCount && row.rowCount > 0) {
            const publicRole = (row.rows[0] as { public_role?: string }).public_role;
            socket.data.user = undefined;
            socket.data.guestAccess = {
              videoId,
              publicToken,
              isEditor: publicRole === 'editor',
            };
            return next();
          }
        } catch { }
      }

      return next(new Error("Authentication error: No valid token or guest access"));
    });

    this.io.on('connection', (socket) => {
      const user = socket.data.user as User | undefined;
      const guestAccess = socket.data.guestAccess as GuestAccess | undefined;

      if (user) {
        socket.join(`user:${user.id}`);
      }

      this.handleRoomLogic(socket, guestAccess);

      if (user) {
        this.handleSyncLogic(socket);
        this.handleLockLogic(socket);
        this.handleEphemeral(socket);
      } else if (guestAccess?.isEditor) {
        this.handleSyncLogicForGuest(socket);
      }

      socket.on('disconnect', () => this.handleHostDisconnect(socket));
    });
  }

  private async handleHostDisconnect(socket: Socket): Promise<void> {
    const videoId = this.hostSocketToVideoId.get(socket.id);
    this.hostSocketToVideoId.delete(socket.id);
    if (!videoId) return;
    const room = await this.getRoomState(videoId);
    if (!room.isLive) return;
    room.isLive = false;
    room.hostId = null;
    room.hostName = null;
    room.pendingHostRequest = null;
    room.markerLock = null;
    await this.saveRoomState(videoId, room);
    this.io.to(videoId).emit('session_ended');
  }

  private handleRoomLogic(socket: Socket, guestAccess: GuestAccess | undefined) {
    socket.on('join_room', async (videoId: string) => {
      const user = socket.data.user as User | undefined;
      const guest = socket.data.guestAccess as GuestAccess | undefined;
      const allowed = user !== undefined || (guest?.videoId === videoId);
      if (!allowed) {
        socket.emit('error_msg', 'You can only join the video room you have access to');
        return;
      }
      socket.join(videoId);
      
      const room = await this.getRoomState(videoId);

      let currentTimestamp = room.lastTimestamp;
      if (room.isLive && room.lastStatus === 'playing') {
         const timeDiff = (Date.now() - room.lastHeartbeatAt) / 1000;
         if (timeDiff < 5) currentTimestamp += timeDiff;
      }

      socket.emit('room_state', {
        isLive: room.isLive,
        hostId: room.hostId,
        hostName: room.hostName,
        lockedBy: room.markerLock?.username || null,
        initialTime: currentTimestamp,
        initialStatus: room.lastStatus
      });
    });
  }

  private handleSyncLogic(socket: Socket) {
    const user = socket.data.user as User;

    socket.on('claim_host', async (videoId: string) => {
      const allowed = await this.isEditorForVideo(videoId, user.id);
      if (!allowed) {
        socket.emit('error_msg', 'Only editors can go live');
        return;
      }
      const room = await this.getRoomState(videoId);
      
      room.hostId = user.id;
      room.hostName = user.name;
      room.isLive = true;
      room.lastStatus = 'paused';
      await this.saveRoomState(videoId, room);

      this.hostSocketToVideoId.set(socket.id, videoId);
      this.io.to(videoId).emit('host_changed', { 
        hostId: room.hostId, 
        hostName: room.hostName 
      });
    });

    socket.on('sync_pulse', async ({ videoId, timestamp, state, frame }) => {
      const room = await this.getRoomState(videoId);
      if (!room.isLive || room.hostId !== user.id) return;

      room.lastTimestamp = timestamp;
      room.lastStatus = state;
      room.lastHeartbeatAt = Date.now();
      this.saveRoomState(videoId, room).catch(console.error);

      socket.to(videoId).emit('sync_update', {
        timestamp,
        frame,
        state,
        driftAllowance: 0.5
      });
    });

    socket.on('end_session', async (videoId: string) => {
      const room = await this.getRoomState(videoId);
      if (room.hostId === user.id) {
        this.hostSocketToVideoId.delete(socket.id);
        room.isLive = false;
        room.hostId = null;
        room.pendingHostRequest = null;
        await this.saveRoomState(videoId, room);
        this.io.to(videoId).emit('session_ended');
      }
    });

    socket.on('request_become_host', async (videoId: string) => {
      const allowed = await this.isEditorForVideo(videoId, user.id);
      if (!allowed) {
        socket.emit('error_msg', 'Only editors can request to become host');
        return;
      }
      const room = await this.getRoomState(videoId);
      if (!room.isLive || room.hostId === null) {
        socket.emit('error_msg', 'No live session to request');
        return;
      }
      if (room.hostId === user.id) {
        socket.emit('error_msg', 'You are already the host');
        return;
      }
      room.pendingHostRequest = { userId: user.id, userName: user.name };
      await this.saveRoomState(videoId, room);
      this.io.to(videoId).emit('host_requested', { userId: user.id, userName: user.name });
    });

    socket.on('release_host', async (videoId: string) => {
      const room = await this.getRoomState(videoId);
      if (room.hostId !== user.id) return;
      this.hostSocketToVideoId.delete(socket.id);
      if (room.pendingHostRequest) {
        const { userId: newHostId, userName: newHostName } = room.pendingHostRequest;
        room.hostId = newHostId;
        room.hostName = newHostName;
        room.pendingHostRequest = null;
        await this.saveRoomState(videoId, room);
        const sockets = await this.io.in(videoId).fetchSockets();
        const newHostSocket = sockets.find((s) => (s.data.user as User)?.id === newHostId);
        if (newHostSocket) this.hostSocketToVideoId.set(newHostSocket.id, videoId);
        this.io.to(videoId).emit('host_changed', { hostId: room.hostId, hostName: room.hostName });
      } else {
        room.isLive = false;
        room.hostId = null;
        await this.saveRoomState(videoId, room);
        this.io.to(videoId).emit('session_ended');
      }
    });
  }

  private handleSyncLogicForGuest(socket: Socket) {
    const guestAccess = socket.data.guestAccess as GuestAccess;

    socket.on('claim_host', async (payload: string | { videoId: string; hostName?: string }) => {
      const videoId = typeof payload === 'string' ? payload : payload?.videoId;
      const hostName = typeof payload === 'object' && payload?.hostName ? payload.hostName : 'Public editor';
      if (!videoId || guestAccess.videoId !== videoId || !guestAccess.isEditor) {
        socket.emit('error_msg', 'Only editors can go live');
        return;
      }
      const room = await this.getRoomState(videoId);
      room.hostId = GUEST_HOST_ID;
      room.hostName = hostName;
      room.isLive = true;
      room.lastStatus = 'paused';
      await this.saveRoomState(videoId, room);
      this.hostSocketToVideoId.set(socket.id, videoId);
      this.io.to(videoId).emit('host_changed', { hostId: GUEST_HOST_ID, hostName: room.hostName });
      socket.emit('you_are_host');
    });

    socket.on('sync_pulse', async ({ videoId, timestamp, state, frame }: { videoId: string; timestamp: number; state: 'playing' | 'paused'; frame: number }) => {
      if (guestAccess.videoId !== videoId) return;
      const room = await this.getRoomState(videoId);
      if (!room.isLive || room.hostId !== GUEST_HOST_ID || this.hostSocketToVideoId.get(socket.id) !== videoId) return;
      room.lastTimestamp = timestamp;
      room.lastStatus = state;
      room.lastHeartbeatAt = Date.now();
      this.saveRoomState(videoId, room).catch(console.error);
      socket.to(videoId).emit('sync_update', { timestamp, frame, state, driftAllowance: 0.5 });
    });

    socket.on('end_session', async (videoId: string) => {
      if (guestAccess.videoId !== videoId) return;
      if (this.hostSocketToVideoId.get(socket.id) !== videoId) return;
      this.hostSocketToVideoId.delete(socket.id);
      const room = await this.getRoomState(videoId);
      room.isLive = false;
      room.hostId = null;
      room.hostName = null;
      room.pendingHostRequest = null;
      await this.saveRoomState(videoId, room);
      this.io.to(videoId).emit('session_ended');
    });

    socket.on('release_host', async (videoId: string) => {
      if (guestAccess.videoId !== videoId) return;
      if (this.hostSocketToVideoId.get(socket.id) !== videoId) return;
      this.hostSocketToVideoId.delete(socket.id);
      const room = await this.getRoomState(videoId);
      room.isLive = false;
      room.hostId = null;
      room.hostName = null;
      room.pendingHostRequest = null;
      await this.saveRoomState(videoId, room);
      this.io.to(videoId).emit('session_ended');
    });
  }

  private handleLockLogic(socket: Socket) {
    const user = socket.data.user as User;

    socket.on('request_draw_lock', async (videoId: string) => {
      const room = await this.getRoomState(videoId);
      const now = Date.now();

      if (room.markerLock && room.markerLock.expiresAt > now && room.markerLock.userId !== user.id) {
        return socket.emit('error_msg', `Locked by ${room.markerLock.username}`);
      }

      room.markerLock = {
        userId: user.id,
        username: user.name,
        expiresAt: now + this.LOCK_DURATION_MS
      };
      room.lastStatus = 'paused';
      await this.saveRoomState(videoId, room);

      this.io.to(videoId).emit('sync_update', { state: 'paused', force: true });
      this.io.to(videoId).emit('lock_update', { lockedBy: room.markerLock.username });
    });

    socket.on('release_draw_lock', async (videoId: string) => {
      const room = await this.getRoomState(videoId);
      if (room.markerLock?.userId === user.id) {
        room.markerLock = null;
        await this.saveRoomState(videoId, room);
        this.io.to(videoId).emit('lock_update', { lockedBy: null });
      }
    });
  }

  private handleEphemeral(socket: Socket) {
    const user = socket.data.user as User;

    socket.on('cursor_move', ({ videoId, x, y }) => {
      socket.to(videoId).emit('remote_cursor', {
        userId: user.id,
        name: user.name,
        color: '#FF0000',
        x, y
      });
    });

    socket.on('drawing_stroke', (data) => {
       socket.to(data.videoId).emit('remote_stroke', data);
    });

    socket.on('live_annotation_stroke', (data: { videoId: string; points: Array<{ x: number; y: number }>; color: string; width: number }) => {
      if (!data?.videoId || !Array.isArray(data.points)) return;
      this.io.to(data.videoId).emit('remote_live_annotation', {
        videoId: data.videoId,
        points: data.points,
        color: data.color ?? '#FF0000',
        width: data.width ?? 3,
        userId: user.id,
        userName: user.name,
      });
    });
  }
}