'use client';

import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import Hls from 'hls.js';

export interface HlsPlayerControlRef {
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoElement: () => HTMLVideoElement | null;
}

export interface HlsPlayerProps {
  manifestUrl: string;
  className?: string;
  poster?: string;
  /** When false, hide native video controls (use external control bar). Default true. */
  showNativeControls?: boolean;
  /** When set, player is controlled by sync (passenger mode): seek and play/pause from these values */
  controlled?: { syncTime: number; syncPlaying: boolean };
  onTimeUpdate?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  /** Called when manifest or playback fails fatally (e.g. 404). Parent can show "Processing..." and retry. */
  onFatalError?: () => void;
  /** Called when manifest has been parsed successfully. Parent can clear "Processing..." state. */
  onManifestParsed?: () => void;
}

function HlsPlayerInner(
  {
    manifestUrl,
    className = '',
    poster,
    showNativeControls = true,
    controlled,
    onTimeUpdate,
    onPlay,
    onPause,
    onFatalError,
    onManifestParsed,
  }: HlsPlayerProps,
  ref: React.Ref<HlsPlayerControlRef | null>
): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAppliedSyncTimeRef = useRef<number>(-1);
  const onFatalErrorRef = useRef(onFatalError);
  const onManifestParsedRef = useRef(onManifestParsed);
  onFatalErrorRef.current = onFatalError;
  onManifestParsedRef.current = onManifestParsed;

  useImperativeHandle(
    ref,
    () => ({
      seek: (t: number) => {
        const v = videoRef.current;
        if (v && Number.isFinite(t)) {
          v.currentTime = t;
        }
      },
      play: () => videoRef.current?.play().catch(() => {}),
      pause: () => videoRef.current?.pause(),
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      getVideoElement: () => videoRef.current,
    }),
    []
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !manifestUrl) return;

    setError(null);

    const isNativeHls =
      video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
      (video.canPlayType('application/x-mpegURL') !== '' && !Hls.isSupported());

    if (Hls.isSupported()) {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        xhrSetup: (xhr, url) => {
          if (url.startsWith(apiBase)) {
            xhr.withCredentials = true;
          }
        },
      });
      hlsRef.current = hls;

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setError(null);
        onManifestParsedRef.current?.();
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error loading video. Retrying…');
              onFatalErrorRef.current?.();
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error. Recovering…');
              hls.recoverMediaError();
              break;
            default:
              setError('Playback error.');
              onFatalErrorRef.current?.();
              hls.destroy();
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (isNativeHls) {
      video.src = manifestUrl;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    setError('HLS is not supported in this browser.');
    return undefined;
  }, [manifestUrl]);

  // Apply controlled sync (passenger mode)
  useEffect(() => {
    if (!controlled) return;
    const video = videoRef.current;
    if (!video) return;
    const { syncTime, syncPlaying } = controlled;
    if (!Number.isFinite(syncTime)) return;
    // Avoid thrashing: only seek if difference is large enough (e.g. > 0.5s)
    const drift = Math.abs(video.currentTime - syncTime);
    if (drift > 0.5 || lastAppliedSyncTimeRef.current !== syncTime) {
      video.currentTime = syncTime;
      lastAppliedSyncTimeRef.current = syncTime;
    }
    if (syncPlaying) video.play().catch(() => {});
    else video.pause();
  }, [controlled?.syncTime, controlled?.syncPlaying]);

  // Report playback events to parent (for host sync_pulse)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdateEv = () => onTimeUpdate?.(video.currentTime);
    const onPlayEv = () => onPlay?.();
    const onPauseEv = () => onPause?.();
    video.addEventListener('timeupdate', onTimeUpdateEv);
    video.addEventListener('play', onPlayEv);
    video.addEventListener('pause', onPauseEv);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdateEv);
      video.removeEventListener('play', onPlayEv);
      video.removeEventListener('pause', onPauseEv);
    };
  }, [onTimeUpdate, onPlay, onPause]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black text-gray-400 ${className}`}>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className={`w-full h-full object-contain bg-black ${className}`}
      controls={showNativeControls}
      playsInline
      poster={poster}
      preload="metadata"
    />
  );
}

export const HlsPlayer = forwardRef<HlsPlayerControlRef | null, HlsPlayerProps>(HlsPlayerInner);
