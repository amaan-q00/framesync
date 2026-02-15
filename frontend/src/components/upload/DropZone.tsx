'use client';

import React, { useState, useRef, useCallback } from 'react';
import { CloudUpload } from 'lucide-react';

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFilesAdded }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const videoFiles = files.filter((file) => file.type.startsWith('video/'));

      if (videoFiles.length > 0) {
        onFilesAdded(videoFiles);
      }
    },
    [onFilesAdded]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const videoFiles = files.filter((file) => file.type.startsWith('video/'));

      if (videoFiles.length > 0) {
        onFilesAdded(videoFiles);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onFilesAdded]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`
        border-2 border-dashed rounded-lg p-6 sm:p-8 text-center cursor-pointer transition-colors duration-200 min-h-[180px] flex flex-col items-center justify-center
        ${isDragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60 bg-surface'}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-3">
        <CloudUpload
          className="w-12 h-12 text-fg-muted shrink-0"
          aria-hidden
        />
        <p className="text-base sm:text-lg font-medium text-fg">
          {isDragOver ? 'Drop videos here' : 'Drop videos here or click to browse'}
        </p>
        <p className="text-sm text-fg-muted">
          Supported formats: MP4, MOV, AVI, WebM
        </p>
      </div>
    </div>
  );
};
