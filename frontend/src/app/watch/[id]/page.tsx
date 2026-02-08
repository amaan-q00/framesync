'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import AppLink from '@/components/ui/AppLink';
import { videoApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { getErrorMessage } from '@/lib/utils';

export default function WatchPage(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const token = searchParams?.get('token') ?? undefined;
  const { error: showError } = useToast();
  const [video, setVideo] = useState<{ title: string; manifestUrl?: string; role: string } | null>(null);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    videoApi
      .getVideo(id, token)
      .then((res) => {
        if (!cancelled) {
          setVideo({
            title: res.data.title,
            manifestUrl: res.data.manifestUrl,
            role: res.data.role,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) showError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, token, showError]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading…</div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4 text-white">
        <p>Video not found or you don’t have access.</p>
        <AppLink href="/dashboard" className="text-blue-400 hover:underline">
          Back to dashboard
        </AppLink>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-900/95 px-4 py-2">
        <AppLink href="/dashboard" className="text-sm text-gray-400 hover:text-white">
          ← Dashboard
        </AppLink>
        <h1 className="truncate text-lg font-medium text-white max-w-md">{video.title}</h1>
        <span className="text-xs text-gray-500 capitalize">{video.role}</span>
      </div>
      <div className="flex flex-col items-center justify-center p-8">
        {video.manifestUrl ? (
          <p className="text-gray-400 text-sm mb-4">
            HLS manifest: {video.manifestUrl.slice(0, 60)}…
          </p>
        ) : null}
        <div className="w-full max-w-4xl aspect-video rounded-lg bg-black flex items-center justify-center text-gray-500">
          Video player (HLS) can be embedded here using the manifest URL.
        </div>
      </div>
    </div>
  );
}
