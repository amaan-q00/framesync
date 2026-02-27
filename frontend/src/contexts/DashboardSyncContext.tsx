'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/hooks/useSocket';

type RefetchFn = () => void;

interface DashboardSyncContextValue {
  subscribeRefetchMyWork: (fn: RefetchFn) => () => void;
  subscribeRefetchShared: (fn: RefetchFn) => () => void;
  notifyUploadComplete: () => void;
  socketConnected: boolean;
  socket: Socket | null;
}

const DashboardSyncContext = createContext<DashboardSyncContextValue | null>(null);

const noop = () => {};
const noopUnsubscribe = () => {};

const defaultContextValue: DashboardSyncContextValue = {
  subscribeRefetchMyWork: () => noopUnsubscribe,
  subscribeRefetchShared: () => noopUnsubscribe,
  notifyUploadComplete: noop,
  socketConnected: false,
  socket: null,
};

export function useDashboardSync(): DashboardSyncContextValue {
  const ctx = useContext(DashboardSyncContext);
  return ctx ?? defaultContextValue;
}

interface DashboardSyncProviderProps {
  children: ReactNode;
}

export function DashboardSyncProvider({ children }: DashboardSyncProviderProps): React.ReactElement {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const { socket, connected } = useSocket(isAuthenticated);

  const refetchMyWorkRef = useRef<Set<RefetchFn>>(new Set());
  const refetchSharedRef = useRef<Set<RefetchFn>>(new Set());
  const [socketConnected, setSocketConnected] = useState(false);

  const subscribeRefetchMyWork = useCallback((fn: RefetchFn) => {
    refetchMyWorkRef.current.add(fn);
    return () => {
      refetchMyWorkRef.current.delete(fn);
    };
  }, []);

  const subscribeRefetchShared = useCallback((fn: RefetchFn) => {
    refetchSharedRef.current.add(fn);
    return () => {
      refetchSharedRef.current.delete(fn);
    };
  }, []);

  const notifyUploadComplete = useCallback(() => {
    refetchMyWorkRef.current.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('DashboardSync: refetchMyWork callback error', e);
      }
    });
  }, []);

  useEffect(() => {
    setSocketConnected(connected);
  }, [connected]);

  useEffect(() => {
    if (!socket) return;

    const onVideoStatus = () => {
      refetchMyWorkRef.current.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('DashboardSync: refetchMyWork callback error', e);
        }
      });
    };

    const onShareAdded = () => {
      refetchSharedRef.current.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('DashboardSync: refetchShared callback error', e);
        }
      });
    };

    const onShareRemoved = () => {
      refetchSharedRef.current.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('DashboardSync: refetchShared callback error', e);
        }
      });
    };

    const onVideoDeleted = () => {
      refetchMyWorkRef.current.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('DashboardSync: refetchMyWork callback error', e);
        }
      });
      refetchSharedRef.current.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('DashboardSync: refetchShared callback error', e);
        }
      });
    };

    socket.on('video:status', onVideoStatus);
    socket.on('share:added', onShareAdded);
    socket.on('share:removed', onShareRemoved);
    socket.on('video:deleted', onVideoDeleted);

    return () => {
      socket.off('video:status', onVideoStatus);
      socket.off('share:added', onShareAdded);
      socket.off('share:removed', onShareRemoved);
      socket.off('video:deleted', onVideoDeleted);
    };
  }, [socket]);

  const value: DashboardSyncContextValue = {
    subscribeRefetchMyWork,
    subscribeRefetchShared,
    notifyUploadComplete,
    socketConnected,
    socket,
  };

  return (
    <DashboardSyncContext.Provider value={value}>
      {children}
    </DashboardSyncContext.Provider>
  );
}
