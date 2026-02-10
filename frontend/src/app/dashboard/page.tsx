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
import type { MyWorkVideo, SharedWithMeVideo } from '@/types/video';
import { Video, Users, Upload, Share2, ChevronRight } from 'lucide-react';

const LIMIT_PREVIEW = 5;

export default function DashboardPage(): React.ReactElement {
  const { success, error: showError } = useToast();
  const { subscribeRefetchMyWork, subscribeRefetchShared } = useDashboardSync();
  const [myWork, setMyWork] = useState<MyWorkVideo[]>([]);
  const [myWorkTotal, setMyWorkTotal] = useState(0);
  const [shared, setShared] = useState<SharedWithMeVideo[]>([]);
  const [sharedTotal, setSharedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessVideo, setAccessVideo] = useState<{
    id: string;
    is_public: boolean;
    public_token?: string | null;
    public_role: 'viewer' | 'editor';
  } | null>(null);

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const [myRes, sharedRes] = await Promise.all([
        videoApi.getMyWorks({ limit: LIMIT_PREVIEW, offset: 0 }),
        videoApi.getSharedWithMe({ limit: LIMIT_PREVIEW, offset: 0 }),
      ]);
      setMyWork(myRes.data);
      setMyWorkTotal(myRes.total);
      setShared(sharedRes.data);
      setSharedTotal(sharedRes.total);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviewRef = useRef(fetchPreview);
  fetchPreviewRef.current = fetchPreview;

  useEffect(() => {
    fetchPreview();
  }, []);

  useEffect(() => {
    const refetch = () => fetchPreviewRef.current();
    const unsubMy = subscribeRefetchMyWork(refetch);
    const unsubShared = subscribeRefetchShared(refetch);
    return () => {
      unsubMy();
      unsubShared();
    };
  }, [subscribeRefetchMyWork, subscribeRefetchShared]);

  const handleDelete = async (videoId: string) => {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    try {
      await videoApi.deleteVideo(videoId);
      success('Video deleted');
      await fetchPreview();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const handleRemoveMyAccess = async (videoId: string) => {
    if (!confirm('Remove your access to this video?')) return;
    try {
      await videoApi.removeMyAccess(videoId);
      success('Access removed');
      await fetchPreview();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        {/* My Work */}
        <section className="mb-8 sm:mb-10">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="flex items-center gap-2 text-lg sm:text-xl font-bold text-gray-900">
              <Video size={22} className="shrink-0 text-gray-600" aria-hidden />
              My work
            </h2>
            {myWorkTotal > LIMIT_PREVIEW && (
              <AppLink
                href="/dashboard/my"
                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500 shrink-0"
              >
                See all ({myWorkTotal})
                <ChevronRight size={18} aria-hidden />
              </AppLink>
            )}
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="rounded-lg border border-gray-200 bg-white h-40 sm:h-44 animate-pulse" />
              ))}
            </div>
          ) : myWork.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 sm:p-8 text-center text-gray-500">
              <Upload size={40} className="mx-auto mb-3 text-gray-400" aria-hidden />
              <p className="text-sm sm:text-base">No videos yet. Use the upload button to add one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
              {myWork.map((video) => (
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
          )}
        </section>

        {/* Shared with me */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="flex items-center gap-2 text-lg sm:text-xl font-bold text-gray-900">
              <Users size={22} className="shrink-0 text-gray-600" aria-hidden />
              Shared with me
            </h2>
            {sharedTotal > LIMIT_PREVIEW && (
              <AppLink
                href="/dashboard/shared"
                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500 shrink-0"
              >
                See all ({sharedTotal})
                <ChevronRight size={18} aria-hidden />
              </AppLink>
            )}
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="rounded-lg border border-gray-200 bg-white h-40 sm:h-44 animate-pulse" />
              ))}
            </div>
          ) : shared.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 sm:p-8 text-center text-gray-500">
              <Share2 size={40} className="mx-auto mb-3 text-gray-400" aria-hidden />
              <p className="text-sm sm:text-base">No videos shared with you yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
              {shared.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  isOwner={false}
                  onRemoveMyAccess={handleRemoveMyAccess}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {accessVideo && (
        <AccessManagementPopup
          videoId={accessVideo.id}
          isPublic={accessVideo.is_public}
          publicToken={accessVideo.public_token}
          publicRole={accessVideo.public_role}
          onClose={() => setAccessVideo(null)}
          onUpdated={fetchPreview}
        />
      )}
    </div>
  );
}
