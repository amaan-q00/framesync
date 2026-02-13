import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../utils/jwt';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { User } from '../types';
import pool from '../config/db';

/** Parses Cookie header string into key-value map. */
function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const eq = part.indexOf('=');
    if (eq === -1) return acc;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k && v) acc[k] = decodeURIComponent(v);
    return acc;
  }, {});
}

export interface GuestAccess {
  videoId: string;
}

// Strict interface for Room State stored in Redis
interface RoomState {
  hostId: number | null;
  hostName: string | null;
  isLive: boolean;
  
  // Time Cache for Late Joiners
  lastTimestamp: number;
  lastStatus: 'playing' | 'paused';
  lastHeartbeatAt: number;
  
  // Mutex Lock for Drawing
  markerLock: {
    userId: number;
    username: string;
    expiresAt: number;
  } | null;

  // Host handover: who requested to become host (visible to current host only)
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
  private readonly LOCK_DURATION_MS = 30000; // 30 seconds
  /** socketId -> videoId: so we can end live when host disconnects */
  private hostSocketToVideoId = new Map<string, string>();

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: env.FRONTEND_URL, // Uses your env variable
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

  // --- REDIS HELPERS ---
  
  private async getRoomState(videoId: string): Promise<RoomState> {
    const raw = await redis.get(`${this.ROOM_PREFIX}${videoId}`);
    if (!raw) return { ...DEFAULT_ROOM_STATE };
    return { ...DEFAULT_ROOM_STATE, ...JSON.parse(raw) };
  }

  private async saveRoomState(videoId: string, state: RoomState): Promise<void> {
    // Expire room state after 24 hours of inactivity
    await redis.setex(`${this.ROOM_PREFIX}${videoId}`, 86400, JSON.stringify(state));
  }

  /** True if userId is video owner or has editor share (for claim_host / request_become_host). */
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

  // --- INITIALIZATION ---

  private initialize() {
    // 1. Authentication Middleware: JWT (cookie or auth) or guest (public link token + videoId)
    this.io.use(async (socket, next) => {
      const cookie = parseCookieHeader(socket.handshake.headers.cookie);
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers?.token as string | undefined) ??
        cookie.auth_token;

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
        } catch {
          // Fall through to guest path if JWT invalid
        }
      }

      // Guest path: public link token + videoId (for watch page real-time comments)
      const publicToken = socket.handshake.auth?.publicToken as string | undefined;
      const videoId = socket.handshake.auth?.videoId as string | undefined;
      if (publicToken && videoId) {
        try {
          const row = await pool.query(
            'SELECT id FROM videos WHERE id = $1 AND is_public = true AND public_token = $2',
            [videoId, publicToken]
          );
          if (row.rowCount && row.rowCount > 0) {
            socket.data.user = undefined;
            socket.data.guestAccess = { videoId };
            return next();
          }
        } catch {
          // DB error: reject
        }
      }

      return next(new Error("Authentication error: No valid token or guest access"));
    });

    // 2. Event Handlers
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
      }

      socket.on('disconnect', () => this.handleHostDisconnect(socket));
    });
  }

  private async handleHostDisconnect(socket: Socket): Promise<void> {
    const videoId = this.hostSocketToVideoId.get(socket.id);
    this.hostSocketToVideoId.delete(socket.id);
    if (!videoId) return;
    const room = await this.getRoomState(videoId);
    if (!room.isLive || room.hostId === null) return;
    room.isLive = false;
    room.hostId = null;
    room.hostName = null;
    room.pendingHostRequest = null;
    room.markerLock = null;
    await this.saveRoomState(videoId, room);
    this.io.to(videoId).emit('session_ended');
  }

  // --- 1. ROOM MANAGEMENT & LATE JOINERS ---
  /** Guest can only join the single video room they have access to. */
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

      // Late Joiner Calculation:
      // If the room is LIVE and PLAYING, we calculate where the playhead is right now
      // by adding the time elapsed since the last heartbeat.
      let currentTimestamp = room.lastTimestamp;
      
      if (room.isLive && room.lastStatus === 'playing') {
         const timeDiff = (Date.now() - room.lastHeartbeatAt) / 1000;
         // Safety check: Don't extrapolate more than 5 seconds (in case host crashed)
         if (timeDiff < 5) {
             currentTimestamp += timeDiff;
         }
      }

      // Send the state to the joining user immediately
      socket.emit('room_state', {
        isLive: room.isLive,
        hostId: room.hostId,
        hostName: room.hostName,
        lockedBy: room.markerLock?.username || null,
        
        // Immediate sync data
        initialTime: currentTimestamp,
        initialStatus: room.lastStatus
      });
    });
  }

  // --- 2. LIVE SYNC LOGIC (DRIVER MODE) ---

  private handleSyncLogic(socket: Socket) {
    const user = socket.data.user as User;

    // A. Claim Host (Go Live) — editors only
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
      room.lastStatus = 'paused'; // Safety default
      
      await this.saveRoomState(videoId, room);

      this.hostSocketToVideoId.set(socket.id, videoId);
      this.io.to(videoId).emit('host_changed', { 
        hostId: room.hostId, 
        hostName: room.hostName 
      });
    });

    // B. Sync Pulse (Heartbeat from Driver)
    socket.on('sync_pulse', async ({ videoId, timestamp, state, frame }) => {
      const room = await this.getRoomState(videoId);

      // Security: Only the current host can dictate time
      if (!room.isLive || room.hostId !== user.id) return;

      // Update Cache
      room.lastTimestamp = timestamp;
      room.lastStatus = state;
      room.lastHeartbeatAt = Date.now();
      
      // Write back to Redis
      this.saveRoomState(videoId, room).catch(console.error);

      // Broadcast to Passengers (excluding sender)
      socket.to(videoId).emit('sync_update', {
        timestamp,
        frame, // Exact frame number for strict sync
        state, 
        driftAllowance: 0.5 // Client tolerance threshold
      });
    });

    // C. Stop Live Session
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

    // D. Request to become host (editors only; broadcast so host can see and show "Hand over")
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

    // E. Release host (current host only): hand over to pending requester or end session
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

  // --- 3. LOCKING LOGIC (MUTEX FOR DRAWING) ---

  private handleLockLogic(socket: Socket) {
    const user = socket.data.user as User;

    socket.on('request_draw_lock', async (videoId: string) => {
      const room = await this.getRoomState(videoId);
      const now = Date.now();

      // Check if locked and not expired
      if (room.markerLock && room.markerLock.expiresAt > now && room.markerLock.userId !== user.id) {
        return socket.emit('error_msg', `Locked by ${room.markerLock.username}`);
      }

      // Grant Lock
      room.markerLock = {
        userId: user.id,
        username: user.name,
        expiresAt: now + this.LOCK_DURATION_MS
      };

      // Force Pause status in State
      room.lastStatus = 'paused';
      
      await this.saveRoomState(videoId, room);

      // 1. Broadcast PAUSE (Drawing requires stillness)
      this.io.to(videoId).emit('sync_update', { state: 'paused', force: true });
      
      // 2. Broadcast LOCK status
      this.io.to(videoId).emit('lock_update', { 
        lockedBy: room.markerLock.username 
      });
    });

    socket.on('release_draw_lock', async (videoId: string) => {
      const room = await this.getRoomState(videoId);
      
      // Only owner can release
      if (room.markerLock?.userId === user.id) {
        room.markerLock = null;
        await this.saveRoomState(videoId, room);
        this.io.to(videoId).emit('lock_update', { lockedBy: null });
      }
    });
  }

  // --- 4. EPHEMERAL EVENTS (HIGH FREQUENCY) ---
  
  private handleEphemeral(socket: Socket) {
    const user = socket.data.user as User;

    socket.on('cursor_move', ({ videoId, x, y }) => {
      socket.to(videoId).emit('remote_cursor', {
        userId: user.id,
        name: user.name,
        color: '#FF0000', // Retrieve from user prefs if available
        x, y
      });
    });

    socket.on('drawing_stroke', (data) => {
       socket.to(data.videoId).emit('remote_stroke', data);
    });

    // Live annotation: ephemeral strokes (no lock, not stored, ~1s client TTL)
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