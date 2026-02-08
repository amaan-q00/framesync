'use client';

import React, { useState, useEffect } from 'react';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { VideoCard } from '@/components/dashboard/VideoCard';
import AppLink from '@/components/ui/AppLink';
import { videoApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { getErrorMessage } from '@/lib/utils';
import type { SharedWithMeVideo } from '@/types/video';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 12;

export default function DashboardSharedPage(): React.ReactElement {
  const { success, error: showError } = useToast();
  const [videos, setVideos] = useState<SharedWithMeVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchPage = async (p: number) => {
    setLoading(true);
    try {
      const res = await videoApi.getSharedWithMe({
        limit: PAGE_SIZE,
        offset: (p - 1) * PAGE_SIZE,
      });
      setVideos(res.data);
      setTotal(res.total);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(page);
  }, [page]);

  const handleRemoveMyAccess = async (videoId: string) => {
    if (!confirm('Remove your access to this video?')) return;
    try {
      await videoApi.removeMyAccess(videoId);
      success('Access removed');
      await fetchPage(page);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Shared with me</h1>
          <AppLink href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
            ← Dashboard
          </AppLink>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white aspect-video animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
            No videos shared with you yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  isOwner={false}
                  onRemoveMyAccess={handleRemoveMyAccess}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <ChevronLeft size={18} />
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Next
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
