'use client';

import React from 'react';
import type { UploadSession } from '@/types/video';
import { useUploadContext } from '@/contexts/UploadContext';

export interface UploadQueueItemProps {
  upload: UploadSession;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1
  );
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function statusColor(status: UploadSession['status']): string {
  switch (status) {
    case 'uploading':
      return 'text-blue-600';
    case 'processing':
      return 'text-amber-600';
    case 'complete':
      return 'text-green-600';
    case 'error':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

function statusLabel(upload: UploadSession): string {
  switch (upload.status) {
    case 'pending':
      return 'Waiting…';
    case 'uploading':
      return `Uploading ${upload.progress}%`;
    case 'processing':
      return 'Processing…';
    case 'complete':
      return 'Complete';
    case 'error':
      return upload.error ?? 'Failed';
    default:
      return upload.status;
  }
}

export function UploadQueueItem({ upload }: UploadQueueItemProps): React.ReactElement {
  const { cancelUpload, removeUpload } = useUploadContext();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{upload.title}</p>
          <p className="text-xs text-gray-500">
            {formatFileSize(upload.file.size)} · {upload.file.name}
          </p>
          {upload.description && (
            <p className="mt-0.5 truncate text-xs text-gray-400">{upload.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-medium ${statusColor(upload.status)}`}>
            {statusLabel(upload)}
          </span>
          {upload.status === 'uploading' && (
            <button
              type="button"
              onClick={() => cancelUpload(upload.videoId)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Cancel
            </button>
          )}
          {(upload.status === 'complete' || upload.status === 'error') && (
            <button
              type="button"
              onClick={() => removeUpload(upload.videoId)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {(upload.status === 'uploading' || upload.status === 'processing') && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${upload.progress}%` }}
            />
          </div>
        </div>
      )}

      {upload.isPublic && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            Public · {upload.publicRole === 'editor' ? 'Editor' : 'Viewer'}
          </span>
        </div>
      )}
    </div>
  );
}
