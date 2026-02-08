'use client';

import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { useUploadContext } from '@/contexts/UploadContext';
import { UploadPopup } from './UploadPopup';

export const UploadButton: React.FC = () => {
  const { uploads } = useUploadContext();
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const activeUploads = uploads.filter(u => u.status !== 'complete' && u.status !== 'error');
  const hasActiveUploads = activeUploads.length > 0;

  return (
    <>
      {/* Floating Upload Button */}
      <button
        type="button"
        onClick={() => setIsPopupOpen(true)}
        aria-label="Upload videos"
        className={`
          fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg 
          hover:bg-blue-700 transition-all duration-200 z-40
          ${hasActiveUploads ? 'ring-4 ring-blue-200' : ''}
        `}
      >
        <Upload size={24} />
        {hasActiveUploads && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
            {activeUploads.length}
          </span>
        )}
      </button>

      {/* Upload Popup */}
      <UploadPopup 
        isOpen={isPopupOpen} 
        onClose={() => setIsPopupOpen(false)} 
      />
    </>
  );
};
