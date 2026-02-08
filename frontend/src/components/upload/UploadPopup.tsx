'use client';

import React, { useState } from 'react';
import { UploadQueueItem } from './UploadQueueItem';
import { DropZone } from './DropZone';
import { useUploadContext } from '@/contexts/UploadContext';
import { useUploadForm } from '@/hooks/useUploadForm';
import { X, Minimize2, Maximize2 } from 'lucide-react';
import Button from '@/components/ui/Button';

export interface UploadPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UploadPopup({ isOpen, onClose }: UploadPopupProps): React.ReactElement | null {
  const { uploads } = useUploadContext();
  const [isMinimized, setIsMinimized] = useState(false);
  const {
    showForm,
    selectedFiles,
    formData,
    setFormData,
    handleFilesAdded,
    handleStartUpload,
    handleCancelForm,
  } = useUploadForm();

  const activeUploads = uploads.filter(
    (u) => u.status !== 'complete' && u.status !== 'error'
  );
  const hasActiveUploads = activeUploads.length > 0;

  const onStartUpload = async () => {
    const ok = await handleStartUpload();
    if (ok) setTimeout(onClose, 500);
  };

  if (!isOpen) return null;

  if (isMinimized) {
    const overallProgress =
      activeUploads.length > 0
        ? Math.round(
            activeUploads.reduce((s, u) => s + u.progress, 0) / activeUploads.length
          )
        : 0;
    return (
      <div
        className="fixed bottom-20 right-6 left-6 sm:left-auto sm:w-80 z-50"
        role="dialog"
        aria-label="Upload progress"
      >
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                Uploading {activeUploads.length} video{activeUploads.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-gray-500">{overallProgress}%</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                aria-label="Expand upload panel"
              >
                <Maximize2 size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 id="upload-title" className="text-lg font-semibold text-gray-900 truncate">
              Upload videos
            </h2>
            {hasActiveUploads && (
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                {activeUploads.length} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {hasActiveUploads && (
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                aria-label="Minimize"
              >
                <Minimize2 size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!showForm ? (
            <DropZone onFilesAdded={handleFilesAdded} />
          ) : (
            <div className="space-y-4">
              {selectedFiles.length > 0 && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Selected ({selectedFiles.length})
                  </p>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {selectedFiles.map((file, i) => (
                      <li key={i} className="truncate">
                        {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
                  placeholder="Video title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
                  placeholder="Optional"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="upload-public"
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, isPublic: e.target.checked }))
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="upload-public" className="text-sm font-medium text-gray-700">
                  Make publicly accessible
                </label>
              </div>

              {formData.isPublic && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access
                  </label>
                  <select
                    value={formData.publicRole}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        publicRole: e.target.value as 'viewer' | 'editor',
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={onStartUpload}
                  disabled={!formData.title.trim() || selectedFiles.length === 0}
                >
                  Start upload
                </Button>
                <Button type="button" variant="outline" onClick={handleCancelForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {uploads.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                Queue ({uploads.length})
              </h3>
              <ul className="space-y-3">
                {uploads.map((upload) => (
                  <li key={upload.videoId}>
                    <UploadQueueItem upload={upload} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
