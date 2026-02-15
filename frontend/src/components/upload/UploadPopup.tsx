'use client';

import React, { useState } from 'react';
import { UploadQueueItem } from './UploadQueueItem';
import { DropZone } from './DropZone';
import { useUploadContext } from '@/contexts/UploadContext';
import { useUploadForm } from '@/hooks/useUploadForm';
import { X, Minimize2, Maximize2, Upload, ArrowLeft } from 'lucide-react';
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
        className="fixed bottom-20 right-6 left-6 sm:left-auto sm:w-80 z-50 animate-slide-up"
        role="dialog"
        aria-label="Upload progress"
      >
        <div className="bg-elevated border border-border rounded-lg shadow-lg p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg truncate">
                Uploading {activeUploads.length} video{activeUploads.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-fg-muted">{overallProgress}%</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-24 h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-fg-muted hover:text-fg hover:bg-surface rounded-lg transition-colors duration-150"
                aria-label="Expand upload panel"
              >
                <Maximize2 size={18} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-elevated border border-border rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 id="upload-title" className="text-lg font-semibold text-fg truncate">
              Upload videos
            </h2>
            {hasActiveUploads && (
              <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                {activeUploads.length} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {hasActiveUploads && (
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-fg-muted hover:text-fg hover:bg-surface rounded-lg transition-colors duration-150"
                aria-label="Minimize"
              >
                <Minimize2 size={20} aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-fg-muted hover:text-fg hover:bg-surface rounded-lg transition-colors duration-150"
              aria-label="Close"
            >
              <X size={20} aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!showForm ? (
            <DropZone onFilesAdded={handleFilesAdded} />
          ) : (
            <div className="space-y-4">
              {selectedFiles.length > 0 && (
                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-sm font-medium text-fg mb-2">
                    Selected ({selectedFiles.length})
                  </p>
                  <ul className="space-y-1 text-sm text-fg-muted">
                    {selectedFiles.map((file, i) => (
                      <li key={i} className="truncate">
                        {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Title <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-[border-color,box-shadow] duration-150"
                  placeholder="Video title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-[border-color,box-shadow] duration-150"
                  placeholder="Optional"
                />
              </div>

              <div className="flex items-center gap-2 min-h-[44px]">
                <input
                  id="upload-public"
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, isPublic: e.target.checked }))
                  }
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="upload-public" className="text-sm font-medium text-fg cursor-pointer">
                  Make publicly accessible
                </label>
              </div>

              {formData.isPublic && (
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">
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
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  type="button"
                  onClick={onStartUpload}
                  disabled={!formData.title.trim() || selectedFiles.length === 0}
                  icon={<Upload size={18} />}
                >
                  Start upload
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelForm}
                  icon={<ArrowLeft size={18} />}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {uploads.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-fg mb-2">
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
