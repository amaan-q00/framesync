'use client';

import React from 'react';
import AppLink from '@/components/ui/AppLink';
import AppLogo from '@/components/ui/AppLogo';
import { useAuth } from '@/contexts/AuthContext';
import { Upload as UploadIcon, ArrowLeft, X, User } from 'lucide-react';
import { useUploadContext } from '@/contexts/UploadContext';
import { useUploadForm } from '@/hooks/useUploadForm';
import { DropZone } from '@/components/upload/DropZone';
import { UploadQueueItem } from '@/components/upload/UploadQueueItem';
import Button from '@/components/ui/Button';

export default function UploadPage(): React.ReactElement {
  const { user } = useAuth();
  const { uploads } = useUploadContext();
  const displayName = user?.name ?? '';
  const initials = displayName ? displayName.slice(0, 2).toUpperCase() : '';
  const {
    showForm,
    selectedFiles,
    formData,
    setFormData,
    handleFilesAdded,
    handleStartUpload,
    handleCancelForm,
  } = useUploadForm();

  const linkClass =
    'flex items-center gap-1.5 rounded-lg p-3 min-h-[44px] min-w-[44px] sm:min-w-0 sm:px-3 sm:py-2 text-fg-muted hover:bg-surface hover:text-fg transition-colors duration-150';

  return (
    <div className="min-h-screen bg-page">
      <nav className="sticky top-0 z-10 border-b border-border bg-elevated">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
            <AppLogo href="/dashboard" />
            <div className="flex items-center gap-1 sm:gap-2">
              <AppLink href="/dashboard" className={linkClass}>
                <ArrowLeft size={18} className="shrink-0" aria-hidden />
                <span className="hidden sm:inline">Dashboard</span>
              </AppLink>
              <AppLink
                href="/settings"
                className="flex items-center gap-2 rounded-lg p-1.5 sm:px-2 sm:py-1.5 min-h-[44px] min-w-[44px] sm:min-w-0 text-fg-muted hover:bg-surface hover:text-fg transition-colors duration-150"
                aria-label="Profile and settings"
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover border border-border shrink-0"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary border border-border shrink-0">
                    {initials ? (
                      <span className="text-xs font-medium">{initials}</span>
                    ) : (
                      <User size={14} aria-hidden />
                    )}
                  </span>
                )}
                <span className="hidden sm:inline max-w-[100px] truncate text-sm">Profile</span>
              </AppLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-fg mb-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <UploadIcon size={24} className="shrink-0" aria-hidden />
          </span>
          Upload videos
        </h1>

        {!showForm ? (
          <DropZone onFilesAdded={handleFilesAdded} />
        ) : (
          <div className="space-y-4">
            {selectedFiles.length > 0 && (
              <div className="rounded-lg bg-surface border border-border p-4">
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

            <div className="rounded-lg bg-surface border border-border p-4 sm:p-6 space-y-4">
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
                  className="w-full px-3 py-2 border border-border rounded-lg bg-page text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-[border-color,box-shadow] duration-150"
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
                  className="w-full px-3 py-2 border border-border rounded-lg bg-page text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-[border-color,box-shadow] duration-150"
                  placeholder="Optional"
                />
              </div>

              <div className="flex items-center gap-2 min-h-[44px]">
                <input
                  id="upload-page-public"
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, isPublic: e.target.checked }))
                  }
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <label
                  htmlFor="upload-page-public"
                  className="text-sm font-medium text-fg cursor-pointer"
                >
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
                    className="w-full px-3 py-2 border border-border rounded-lg bg-page text-fg focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => handleStartUpload()}
                  disabled={!formData.title.trim() || selectedFiles.length === 0}
                  icon={<UploadIcon size={18} />}
                >
                  Start upload
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelForm}
                  icon={<X size={18} />}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {uploads.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-fg mb-3">
              Upload queue ({uploads.length})
            </h2>
            <ul className="space-y-3">
              {uploads.map((upload) => (
                <li key={upload.videoId}>
                  <UploadQueueItem upload={upload} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
