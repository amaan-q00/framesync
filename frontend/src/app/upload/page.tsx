'use client';

import React from 'react';
import AppLink from '@/components/ui/AppLink';
import { useUploadContext } from '@/contexts/UploadContext';
import { useUploadForm } from '@/hooks/useUploadForm';
import { DropZone } from '@/components/upload/DropZone';
import { UploadQueueItem } from '@/components/upload/UploadQueueItem';
import Button from '@/components/ui/Button';

export default function UploadPage(): React.ReactElement {
  const { uploads } = useUploadContext();
  const {
    showForm,
    selectedFiles,
    formData,
    setFormData,
    handleFilesAdded,
    handleStartUpload,
    handleCancelForm,
  } = useUploadForm();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <AppLink
              href="/dashboard"
              className="text-xl font-semibold text-gray-900 hover:text-blue-600"
            >
              FrameSync
            </AppLink>
            <div className="flex items-center gap-4">
              <AppLink
                href="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Dashboard
              </AppLink>
              <AppLink
                href="/settings"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Settings
              </AppLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload videos</h1>

        {!showForm ? (
          <DropZone onFilesAdded={handleFilesAdded} />
        ) : (
          <div className="space-y-4">
            {selectedFiles.length > 0 && (
              <div className="rounded-lg bg-white border border-gray-200 p-4">
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

            <div className="rounded-lg bg-white border border-gray-200 p-4 space-y-4">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="Optional"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="upload-page-public"
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, isPublic: e.target.checked }))
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="upload-page-public" className="text-sm font-medium text-gray-700">
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
                  onClick={() => handleStartUpload()}
                  disabled={!formData.title.trim() || selectedFiles.length === 0}
                >
                  Start upload
                </Button>
                <Button type="button" variant="outline" onClick={handleCancelForm}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {uploads.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
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
