'use client';

import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { useUploadContext } from '@/contexts/UploadContext';
import { UploadPopup } from './UploadPopup';

export const UploadButton: React.FC = () => {
  const { uploads } = useUploadContext();
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const activeUploads = uploads.filter(
    (u) => u.status !== 'complete' && u.status !== 'error'
  );
  const hasActiveUploads = activeUploads.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsPopupOpen(true)}
        aria-label="Upload videos"
        className={`
          fixed bottom-6 right-6 bg-primary text-white p-4 rounded-full shadow-lg
          min-h-[56px] min-w-[56px] flex items-center justify-center
          hover:opacity-90 transition-all duration-200 z-40
          ${hasActiveUploads ? 'ring-4 ring-primary/30' : ''}
        `}
      >
        <Upload size={24} aria-hidden />
        {hasActiveUploads && (
          <span className="absolute -top-1 -right-1 bg-danger text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-elevated">
            {activeUploads.length}
          </span>
        )}
      </button>

      <UploadPopup isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)} />
    </>
  );
};
