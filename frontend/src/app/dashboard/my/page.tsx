'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { VideoCard } from '@/components/dashboard/VideoCard';
import { AccessManagementPopup } from '@/components/dashboard/AccessManagementPopup';
import AppLink from '@/components/ui/AppLink';
import { videoApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useDashboardSync } from '@/contexts/DashboardSyncContext';
import { getErrorMessage } from '@/lib/utils';
import type { MyWorkVideo } from '@/types/video';
import { ChevronLeft, ChevronRight, Video, ArrowLeft } from 'lucide-react';

const PAGE_SIZE = 12;

export default function DashboardMyPage(): React.ReactElement {
  const { success, error: showError } = useToast();
  const { subscribeRefetchMyWork } = useDashboardSync();
  const [videos, setVideos] = useState<MyWorkVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [accessVideo, setAccessVideo] = useState<{
    id: string;
    is_public: boolean;
    public_token?: string | null;
    public_role: 'viewer' | 'editor';
  } | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchPage = async (p: number) => {
    setLoading(true);
    try {
      const res = await videoApi.getMyWorks({
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

  const pageRef = useRef(page);
  pageRef.current = page;
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  useEffect(() => {
    fetchPage(page);
  }, [page]);

  useEffect(() => {
    const refetch = () => fetchPageRef.current(pageRef.current);
    const unsub = subscribeRefetchMyWork(refetch);
    return unsub;
  }, [subscribeRefetchMyWork]);

  const handleDelete = async (videoId: string) => {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    try {
      await videoApi.deleteVideo(videoId);
      success('Video deleted');
      await fetchPage(page);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-gray-900">
            <Video size={24} className="shrink-0 text-gray-600" aria-hidden />
            My work
          </h1>
          <AppLink
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 w-fit"
          >
            <ArrowLeft size={18} aria-hidden />
            Dashboard
          </AppLink>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white aspect-video animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
            No videos yet. Use the upload button to add one.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  isOwner
                  onDelete={handleDelete}
                  onManageAccess={() =>
                    setAccessVideo({
                      id: video.id,
                      is_public: video.is_public,
                      public_token: video.public_token,
                      public_role: video.public_role,
                    })
                  }
                />
              ))}
            </div>

            {totalPages > 1 && (
            <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none touch-manipulation"
              >
                <ChevronLeft size={18} aria-hidden />
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none touch-manipulation"
              >
                Next
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
            )}
          </>
        )}
      </main>

      {accessVideo && (
        <AccessManagementPopup
          videoId={accessVideo.id}
          isPublic={accessVideo.is_public}
          publicToken={accessVideo.public_token}
          publicRole={accessVideo.public_role}
          onClose={() => setAccessVideo(null)}
          onUpdated={() => fetchPage(page)}
        />
      )}
    </div>
  );
}
