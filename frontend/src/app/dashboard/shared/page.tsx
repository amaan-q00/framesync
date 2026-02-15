'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { VideoCard } from '@/components/dashboard/VideoCard';
import AppLink from '@/components/ui/AppLink';
import { videoApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useDashboardSync } from '@/contexts/DashboardSyncContext';
import { getErrorMessage } from '@/lib/utils';
import type { SharedWithMeVideo } from '@/types/video';
import { ChevronLeft, ChevronRight, Users, ArrowLeft, Share2 } from 'lucide-react';

const PAGE_SIZE = 12;

export default function DashboardSharedPage(): React.ReactElement {
  const { success, error: showError } = useToast();
  const { subscribeRefetchShared } = useDashboardSync();
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

  const pageRef = useRef(page);
  pageRef.current = page;
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  useEffect(() => {
    fetchPage(page);
  }, [page]);

  useEffect(() => {
    const refetch = () => fetchPageRef.current(pageRef.current);
    const unsub = subscribeRefetchShared(refetch);
    return unsub;
  }, [subscribeRefetchShared]);

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
    <div className="min-h-screen bg-page">
      <DashboardNav />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-fg">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Users size={22} className="shrink-0" aria-hidden />
            </span>
            Shared with me
          </h1>
          <AppLink
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-accent w-fit min-h-[44px] items-center transition-colors duration-150"
          >
            <ArrowLeft size={18} aria-hidden />
            Dashboard
          </AppLink>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface aspect-video animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 sm:p-12 text-center text-fg-muted">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary mb-3">
              <Share2 size={32} aria-hidden />
            </span>
            <p className="text-sm sm:text-base">No videos shared with you yet.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
            <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 min-h-[44px] text-sm font-medium text-fg hover:bg-elevated disabled:opacity-50 disabled:pointer-events-none touch-manipulation transition-colors duration-150"
              >
                <ChevronLeft size={18} aria-hidden />
                Previous
              </button>
              <span className="text-sm text-fg-muted">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 min-h-[44px] text-sm font-medium text-fg hover:bg-elevated disabled:opacity-50 disabled:pointer-events-none touch-manipulation transition-colors duration-150"
              >
                Next
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
