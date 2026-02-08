'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useUploadContext } from '@/contexts/UploadContext';

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const videoFiles = files.filter(file => file.type.startsWith('video/'));
    
    if (videoFiles.length > 0) {
      onFilesAdded(videoFiles);
    }
  }, [onFilesAdded]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const videoFiles = files.filter(file => file.type.startsWith('video/'));
    
    if (videoFiles.length > 0) {
      onFilesAdded(videoFiles);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFilesAdded]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragOver 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }
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
      
      <div className="flex flex-col items-center">
        <svg
          className="w-12 h-12 text-gray-400 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        
        <p className="text-lg font-medium text-gray-900 mb-1">
          {isDragOver ? 'Drop videos here' : 'Drop videos here or click to browse'}
        </p>
        <p className="text-sm text-gray-500">
          Supported formats: MP4, MOV, AVI, WebM
        </p>
      </div>
    </div>
  );
};