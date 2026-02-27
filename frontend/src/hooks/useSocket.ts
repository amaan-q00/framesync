'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getToken } from '@/lib/authToken';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface UseSocketResult {
  socket: Socket | null;
  connected: boolean;
}

export function useSocket(isAuthenticated: boolean): UseSocketResult {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
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

    const token = getToken();
    const s = io(API_BASE_URL, {
      withCredentials: true,
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'],
    });

    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));

    return () => {
      s.disconnect();
      s.removeAllListeners();
      setSocket(null);
      setConnected(false);
    };
  }, [isAuthenticated]);

  return { socket, connected };
}
