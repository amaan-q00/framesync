'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MoreVertical, Trash2, Share2, UserMinus } from 'lucide-react';
import type { MyWorkVideo, SharedWithMeVideo } from '@/types/video';

const STATUS_LABELS: Record<string, string> = {
  uploading: 'Uploading',
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

type VideoItem = (MyWorkVideo | SharedWithMeVideo) & { thumbnail_url?: string | null };

export interface VideoCardProps {
  video: VideoItem;
  isOwner: boolean;
  onDelete?: (videoId: string) => void;
  onManageAccess?: (videoId: string) => void;
  onRemoveMyAccess?: (videoId: string) => void;
}

export function VideoCard({
  video,
  isOwner,
  onDelete,
  onManageAccess,
  onRemoveMyAccess,
}: VideoCardProps): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);

  const thumbnailUrl = video.thumbnail_url ?? null;
  const statusLabel = STATUS_LABELS[video.status] ?? video.status;
  const isShared = !isOwner && 'owner_name' in video;

  return (
    <div className="group relative rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-visible">
      <Link href={`/watch/${video.id}`} className="block h-28 w-full bg-gray-100 overflow-hidden rounded-t-lg">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <span className="text-sm">No thumbnail</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </Link>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/watch/${video.id}`}>
              <h3 className="truncate font-medium text-gray-900 hover:text-blue-600">
                {video.title}
              </h3>
            </Link>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                {statusLabel}
              </span>
              {video.views != null && video.views > 0 && (
                <span>{video.views} views</span>
              )}
              {isShared && 'owner_name' in video && (
                <span>by {video.owner_name}</span>
              )}
            </div>
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Actions"
            >
              <MoreVertical size={18} />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  aria-hidden="true"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {isOwner && (
                    <>
                      {onManageAccess && (
                        <button
                          type="button"
                          onClick={() => {
                            onManageAccess(video.id);
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Share2 size={16} />
                          Manage access
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(video.id);
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      )}
                    </>
                  )}
                  {!isOwner && onRemoveMyAccess && (
                    <button
                      type="button"
                      onClick={() => {
                        onRemoveMyAccess(video.id);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <UserMinus size={16} />
                      Remove my access
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
