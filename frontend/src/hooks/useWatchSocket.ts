'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface UseWatchSocketResult {
  socket: Socket | null;
  connected: boolean;
}

/**
 * Guest socket for the watch page: connects with public link token + videoId
 * so unauthenticated users can join the video room and receive real-time comments.
 */
export function useWatchSocket(
  videoId: string,
  publicToken: string | undefined,
  enabled: boolean
): UseWatchSocketResult {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;

  useEffect(() => {
    if (!enabled || !videoId || !publicToken) {
      setSocket((prev) => {
        if (prev) {
          prev.disconnect();
          prev.removeAllListeners();
        }
        return null;
      });
      setConnected(false);
      return;
    }

    const s = io(API_BASE_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: {
        publicToken,
        videoId,
      },
    });

    setSocket(s);

    const onConnect = () => {
      setConnected(true);
      const id = videoIdRef.current;
      if (id) s.emit('join_room', id);
    };

    s.on('connect', onConnect);
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));

    if (s.connected) {
      s.emit('join_room', videoId);
    }

    return () => {
      s.disconnect();
      s.removeAllListeners();
      setSocket(null);
      setConnected(false);
    };
  }, [enabled, videoId, publicToken]);

  return { socket, connected };
}
