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
      return 'text-primary';
    case 'processing':
      return 'text-warning';
    case 'complete':
      return 'text-success';
    case 'error':
      return 'text-danger';
    default:
      return 'text-fg-muted';
  }
}

function statusLabel(upload: UploadSession): string {
  const completed = upload.chunks.filter((c) => c.status === 'complete').length;
  const total = upload.chunks.length;
  const partLabel = total > 0 ? ` · Part ${completed}/${total}` : '';
  switch (upload.status) {
    case 'pending':
      return 'Waiting…';
    case 'uploading':
      return `Uploading ${upload.progress}%${partLabel}`;
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
    <div className="rounded-lg border border-border bg-surface p-4 transition-colors duration-150">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{upload.title}</p>
          <p className="text-xs text-fg-muted">
            {formatFileSize(upload.file.size)} · {upload.file.name}
          </p>
          {upload.description && (
            <p className="mt-0.5 truncate text-xs text-fg-muted">{upload.description}</p>
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
              className="text-xs text-danger hover:opacity-90 min-h-[32px] flex items-center transition-opacity"
            >
              Cancel
            </button>
          )}
          {(upload.status === 'complete' || upload.status === 'error') && (
            <button
              type="button"
              onClick={() => removeUpload(upload.videoId)}
              className="text-xs text-fg-muted hover:text-fg min-h-[32px] flex items-center transition-colors duration-150"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {(upload.status === 'uploading' || upload.status === 'processing') && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${upload.progress}%` }}
            />
          </div>
        </div>
      )}

      {upload.isPublic && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
            Public · {upload.publicRole === 'editor' ? 'Editor' : 'Viewer'}
          </span>
        </div>
      )}
    </div>
  );
}
