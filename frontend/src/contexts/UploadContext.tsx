'use client';

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useUpload } from '@/hooks/useUpload';
import { UploadSession } from '@/types/video';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardSync } from '@/contexts/DashboardSyncContext';

interface UploadContextType {
  uploads: UploadSession[];
  addUpload: (
    file: File,
    title: string,
    description?: string,
    isPublic?: boolean,
    publicRole?: 'viewer' | 'editor'
  ) => Promise<string>;
  cancelUpload: (videoId: string) => void;
  removeUpload: (videoId: string) => void;
  clearUploads: () => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const useUploadContext = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUploadContext must be used within UploadProvider');
  }
  return context;
};

interface UploadProviderProps {
  children: ReactNode;
}

export const UploadProvider: React.FC<UploadProviderProps> = ({ children }) => {
  const { notifyUploadComplete } = useDashboardSync();
  const uploadHook = useUpload({
    onUploadComplete: notifyUploadComplete,
  });
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      uploadHook.clearUploads();
    }
  }, [user, uploadHook.clearUploads]);

  return (
    <UploadContext.Provider value={uploadHook}>
      {children}
    </UploadContext.Provider>
  );
};
